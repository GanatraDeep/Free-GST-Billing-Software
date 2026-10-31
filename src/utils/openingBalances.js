// Divtech Hisaab - opening balances: what each party owed (or had paid in
// advance) on the day the books start in this app, carried over from the
// previous software (e.g. Miracle). Used by the server (checks on save) and the
// screens and reports. Standalone: imports nothing, so the server can load it.
//
// A record:
//   { id, party: 'client' | 'supplier', name, amount (> 0),
//     direction: 'owed'    - client owes you / you owe the supplier
//              | 'advance' - client paid you in advance / you paid the supplier in advance,
//     asOn: 'YYYY-MM-DD', note, payments: [{ id, date, amount, mode, note, receiptNo? }],
//     ownerGstin, ownerName, createdAt, updatedAt }
//
// Payments are recorded only on an 'owed' balance (money that settles it). An
// advance stays as it is and shows as a credit (a minus) in the party's totals.

export const OPENING_PARTIES = ['client', 'supplier'];
export const OPENING_DIRECTIONS = ['owed', 'advance'];
// What a receipt's "Against Invoice" holds when it pays an opening balance.
export const OPENING_REF = 'Opening balance';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
export const partyKey = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

export const openingPaid = (ob) => r2((ob?.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0));

// Signed balance still open today: + means the client still owes you (or you
// still owe the supplier); - means an advance (credit) in the party's favour.
export const openingDue = (ob) => {
  if (!ob) return 0;
  if (ob.direction === 'advance') return -r2(ob.amount);
  return r2(Math.max(0, r2(ob.amount) - openingPaid(ob)));
};

// '' when the record can be saved, else what is wrong (shown to the user).
export function validateOpening(ob) {
  if (!ob || typeof ob !== 'object') return 'Nothing to save.';
  if (!OPENING_PARTIES.includes(ob.party)) return 'Choose Client or Supplier.';
  if (!String(ob.name || '').trim()) return 'Enter the party name.';
  if (String(ob.name).length > 200) return 'The party name is too long.';
  const amt = Number(ob.amount);
  if (!Number.isFinite(amt) || amt <= 0) return 'Enter an amount more than 0.';
  if (amt > 1e12) return 'The amount is too large.';
  if (!OPENING_DIRECTIONS.includes(ob.direction)) return 'Choose whether the balance is owed or an advance.';
  if (!isDay(ob.asOn)) return 'Enter the date the balance is as on.';
  if (ob.payments !== undefined && !Array.isArray(ob.payments)) return 'Payments are not a list.';
  for (const p of ob.payments || []) {
    const a = Number(p?.amount);
    if (!Number.isFinite(a) || a <= 0) return 'Each payment needs an amount more than 0.';
    if (!isDay(p?.date)) return 'Each payment needs a date.';
  }
  if ((ob.payments || []).length && ob.direction === 'advance') return 'Payments can only be recorded on a balance that is owed.';
  if (openingPaid(ob) > r2(amt) + 0.005) return 'The payments add up to more than the opening balance.';
  return '';
}

// Only the known fields, tidied (the server stores exactly this).
export function cleanOpening(ob) {
  const out = {
    party: ob.party,
    name: String(ob.name || '').trim().replace(/\s+/g, ' '),
    amount: r2(ob.amount),
    direction: ob.direction,
    asOn: ob.asOn,
    note: String(ob.note || '').trim().slice(0, 500),
    payments: (ob.payments || []).map((p) => ({
      id: String(p.id || ''),
      date: p.date,
      amount: r2(p.amount),
      mode: String(p.mode || 'other').slice(0, 30),
      note: String(p.note || '').slice(0, 300),
      ...(p.receiptNo ? { receiptNo: String(p.receiptNo).slice(0, 60) } : {}),
      ...(p.receiptId ? { receiptId: String(p.receiptId).slice(0, 80) } : {}),
    })),
    ownerGstin: String(ob.ownerGstin || ''),
    ownerName: String(ob.ownerName || ''),
  };
  for (const k of ['id', 'createdAt', 'updatedAt']) if (ob[k]) out[k] = String(ob[k]);
  return out;
}

// The open (owed or advance) balance of one party, or null.
export const openingFor = (list, party, name) => {
  const key = partyKey(name);
  return (list || []).find((o) => o.party === party && partyKey(o.name) === key) || null;
};

// Rows for the outstanding reports, in the shape bills give them:
// { name, date, due } with due signed (advances are minus).
export const openingOutstandingEntries = (list, party) => (list || [])
  .filter((o) => o.party === party)
  .map((o) => ({ name: o.name, date: o.asOn, due: openingDue(o), opening: true }))
  .filter((e) => Math.abs(e.due) > 0.005);

// ---- CSV import -------------------------------------------------------------
// One row per party. Headers are matched loosely, so a list exported from
// Miracle or Tally works after little or no editing:
//   Name | Type (Client / Supplier, Debtor / Creditor) | Amount | Dr/Cr | As on | Note
// Rules: Dr is money owed TO you, Cr is money you owe.
//   Client + Dr  -> owed       Client + Cr  -> advance
//   Supplier + Cr -> owed      Supplier + Dr -> advance
//   No type: Dr -> client owed, Cr -> supplier owed.
// "12,500.00 Dr" in the amount column, and a minus sign (= Cr), work too.

export const OPENING_SAMPLE = [
  'Name,Type,Amount,Dr/Cr,As on,Note',
  'Shree Ram Kirana Stores,Client,45000,Dr,2026-10-31,From Miracle',
  'Patel Traders,Client,5000,Cr,2026-10-31,Advance received',
  'Saurashtra Oil Mills,Supplier,320000,Cr,2026-10-31,',
].join('\n');

function splitCsvLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === '\t' || c === ';') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const HEADERS = {
  name: /^(party|party name|name|ledger|ledger name|account|account name|client|supplier|customer)$/,
  type: /^(type|party type|group|under|category)$/,
  amount: /^(amount|balance|closing balance|opening balance|closing|opening|amt|rs|rs\.|₹)$/,
  drcr: /^(dr\/cr|dr \/ cr|drcr|dr or cr|side|cr\/dr|nature)$/,
  asOn: /^(as on|as on date|date|as-on|asof|as of)$/,
  note: /^(note|notes|remark|remarks|narration)$/,
};

// "31/10/2026", "31-10-2026", "2026-10-31", "31.10.2026" -> "2026-10-31"
export function parseDay(s) {
  const t = String(s || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

function partyOf(typeText) {
  const t = String(typeText || '').toLowerCase();
  if (/client|customer|debtor|buyer|sale/.test(t)) return 'client';
  if (/supplier|vendor|creditor|seller|purchase|party payable/.test(t)) return 'supplier';
  return '';
}

// -> { list: [records ready to save, without ids], errors: ['Row 3: ...'], skipped: n }
export function openingCsvToList(text, { defaultAsOn = '' } = {}) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { list: [], errors: ['The file is empty.'], skipped: 0 };
  const head = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, ' ').trim());
  const col = {};
  for (const [k, re] of Object.entries(HEADERS)) col[k] = head.findIndex((h) => re.test(h));
  if (col.name < 0 || col.amount < 0) {
    return { list: [], errors: ['The first row must have column names, with at least Name and Amount.'], skipped: 0 };
  }
  const list = [], errors = [];
  let skipped = 0;
  const seen = new Set();
  lines.slice(1).forEach((line, i) => {
    const row = i + 2;
    const cells = splitCsvLine(line);
    const name = (cells[col.name] || '').trim();
    if (!name) { skipped += 1; return; }
    let amtText = String(cells[col.amount] || '').trim();
    let side = col.drcr >= 0 ? String(cells[col.drcr] || '').trim().toLowerCase() : '';
    const inline = /\b(dr|cr)\.?\s*$/i.exec(amtText);
    if (inline) { side = side || inline[1].toLowerCase(); amtText = amtText.slice(0, inline.index); }
    let amount = Number(amtText.replace(/[₹,\s]|rs\.?/gi, '').replace(/^\((.*)\)$/, '-$1'));
    if (!Number.isFinite(amount) || amtText === '') { errors.push(`Row ${row} (${name}): the amount "${cells[col.amount] || ''}" is not a number.`); return; }
    if (amount === 0) { skipped += 1; return; }
    if (amount < 0) { amount = -amount; side = side ? (side.startsWith('d') ? 'cr' : 'dr') : 'cr'; }
    side = side.startsWith('c') ? 'cr' : side.startsWith('d') ? 'dr' : '';
    let party = col.type >= 0 ? partyOf(cells[col.type]) : '';
    if (!party) party = side === 'cr' ? 'supplier' : 'client';
    if (!side) side = party === 'client' ? 'dr' : 'cr';
    const direction = (party === 'client') === (side === 'dr') ? 'owed' : 'advance';
    const asOn = (col.asOn >= 0 ? parseDay(cells[col.asOn]) : '') || defaultAsOn;
    const rec = { party, name: name.replace(/\s+/g, ' '), amount: r2(amount), direction, asOn, note: col.note >= 0 ? (cells[col.note] || '') : '', payments: [] };
    const problem = validateOpening(rec);
    if (problem) { errors.push(`Row ${row} (${name}): ${problem}`); return; }
    const key = `${party}|${partyKey(name)}`;
    if (seen.has(key)) { errors.push(`Row ${row} (${name}): this ${party} is in the file twice; only the first row is used.`); return; }
    seen.add(key);
    list.push(rec);
  });
  return { list, errors, skipped };
}

export const openingToCsv = (list) => {
  const q = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  const rows = (list || []).map((o) => {
    const dr = (o.party === 'client') === (o.direction === 'owed');
    return [o.name, o.party === 'client' ? 'Client' : 'Supplier', r2(o.amount), dr ? 'Dr' : 'Cr', o.asOn, openingPaid(o), Math.abs(openingDue(o)), o.note || ''].map(q).join(',');
  });
  return ['Name,Type,Amount,Dr/Cr,As on,Paid so far,Still open,Note', ...rows].join('\n');
};
