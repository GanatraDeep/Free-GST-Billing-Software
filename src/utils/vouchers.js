// Divtech Hisaab - your own accounts (capital, loans, CC / OD, fixed assets,
// loans given...) and vouchers (payment, receipt, contra, journal). Pure:
// shared by the screens, the server and the tests (scripts/ledger-test.mjs).
// The accounting itself is in utils/ledgers.js (postings).

export const ACCOUNT_GROUP_CHOICES = [
  ['capital', 'Capital (owner / partners)'],
  ['secured-loans', 'Loan taken: secured (bank term loan, vehicle loan)'],
  ['unsecured-loans', 'Loan taken: unsecured (from family, friends)'],
  ['cc', 'Bank CC / OD account'],
  ['bank-accounts', 'Another bank account (current / savings)'],
  ['fixed-assets', 'Fixed asset (furniture, vehicle, machine, computer)'],
  ['investments', 'Investment (FD, shares, mutual fund)'],
  ['loans-advances', 'Loan or advance given'],
  ['deposits', 'Deposit given (rent deposit, electricity deposit)'],
  ['current-assets', 'Other asset'],
  ['current-liabilities', 'Other liability (salary payable, provisions)'],
  ['indirect-expenses', 'Other expense (interest, depreciation, salary...)'],
  ['indirect-incomes', 'Other income (interest received, discount, commission)'],
  ['direct-expenses', 'Direct expense on buying goods (freight, loading)'],
  ['direct-incomes', 'Direct income'],
];
const GROUP_IDS = ACCOUNT_GROUP_CHOICES.map(([id]) => id);
// Which side an account of a group usually starts on.
export const naturalSide = (group) => (['capital', 'secured-loans', 'unsecured-loans', 'cc', 'current-liabilities', 'indirect-incomes', 'direct-incomes'].includes(group) ? 'Cr' : 'Dr');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

export function accountProblem(a, others = []) {
  const name = text(a?.name, 200);
  if (!name) return 'Give the account a name, such as "SBI CC account" or "Capital - Ramesh".';
  if (!GROUP_IDS.includes(a?.group)) return 'Pick what kind of account it is.';
  if (others.some((o) => o.id !== a.id && text(o.name, 200).toLowerCase() === name.toLowerCase() && o.ownerGstin === a.ownerGstin)) return `There is already an account called ${name}.`;
  if (Number(a.opening) < 0) return 'Enter the opening balance without a minus sign, and pick Dr or Cr.';
  if (Number(a.opening) > 0 && !isDate(a.asOn)) return 'Enter the date of the opening balance.';
  if (a.group === 'cc' && Number(a.limit) < 0) return 'The limit cannot be below zero.';
  return '';
}
export function cleanAccount(a) {
  return {
    id: text(a.id, 60) || `acc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: text(a.name, 200),
    group: a.group,
    opening: r2(Math.abs(Number(a.opening) || 0)),
    openingSide: a.openingSide === 'Cr' ? 'Cr' : 'Dr',
    asOn: isDate(a.asOn) ? a.asOn : '',
    ...(a.group === 'cc' ? { limit: r2(Math.max(0, Number(a.limit) || 0)), interestRate: r2(Math.max(0, Number(a.interestRate) || 0)) } : {}),
    ...(['secured-loans', 'unsecured-loans', 'loans-advances'].includes(a.group) ? { interestRate: r2(Math.max(0, Number(a.interestRate) || 0)) } : {}),
    ...(a.group === 'fixed-assets' ? { depRate: r2(Math.min(100, Math.max(0, Number(a.depRate) || 0))) } : {}),
    accountNumber: text(a.accountNumber, 40),
    note: text(a.note, 500),
    ownerGstin: text(a.ownerGstin, 20), ownerName: text(a.ownerName, 200),
    createdAt: text(a.createdAt, 40) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export const VOUCHER_TYPES = [
  ['payment', 'Payment', 'Money paid out: a loan repaid, an advance given, interest, rent...'],
  ['receipt', 'Receipt', 'Money received: a loan taken, capital brought in, interest received...'],
  ['contra', 'Contra', 'Between cash, bank and CC: cash deposited, withdrawn, CC to bank...'],
  ['journal', 'Journal', 'No money moves: depreciation, interest charged by the bank, adjustments'],
];
export const VOUCHER_PREFIX = { payment: 'PV', receipt: 'RV', contra: 'CV', journal: 'JV' };

export function voucherProblem(v) {
  if (!VOUCHER_PREFIX[v?.type]) return 'Pick the voucher type.';
  if (!isDate(v.date)) return 'Enter the date.';
  const lines = (v.lines || []).filter((l) => l && (Number(l.dr) > 0 || Number(l.cr) > 0));
  if (lines.length < 2) return 'A voucher needs at least one debit and one credit.';
  if (lines.some((l) => !String(l.account || '').trim())) return 'Pick the account on every line.';
  if (lines.some((l) => Number(l.dr) < 0 || Number(l.cr) < 0 || (Number(l.dr) > 0 && Number(l.cr) > 0))) return 'Each line is either a debit or a credit, above zero.';
  const dr = r2(lines.reduce((s, l) => s + (Number(l.dr) || 0), 0));
  const cr = r2(lines.reduce((s, l) => s + (Number(l.cr) || 0), 0));
  if (Math.abs(dr - cr) > 0.005) return `Debits (${dr.toFixed(2)}) and credits (${cr.toFixed(2)}) must be equal.`;
  return '';
}
export function cleanVoucher(v) {
  return {
    id: text(v.id, 60) || `vch_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    type: v.type,
    number: text(v.number, 40),
    date: v.date,
    narration: text(v.narration, 500),
    // What made it (gst:<MMYYYY> for a GSTR-3B payment), to find it again.
    ...(v.tag ? { tag: text(v.tag, 60) } : {}),
    lines: (v.lines || []).filter((l) => Number(l.dr) > 0 || Number(l.cr) > 0)
      .map((l) => ({ account: text(l.account, 300), dr: r2(l.dr), cr: r2(l.cr) })),
    ownerGstin: text(v.ownerGstin, 20), ownerName: text(v.ownerName, 200),
    createdAt: text(v.createdAt, 40) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Next voucher number of a type in a financial year: PV/26-27/0001.
export function nextVoucherNumber(vouchers, type, fyLabel) {
  const short = String(fyLabel || '').replace(/^\d\d(?=\d\d-)/, '');
  const prefix = `${VOUCHER_PREFIX[type] || 'JV'}/${short}/`;
  const max = (vouchers || []).filter((v) => String(v.number || '').startsWith(prefix))
    .reduce((m, v) => Math.max(m, parseInt(String(v.number).slice(prefix.length), 10) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

// Depreciation for a financial year on the written-down value: full rate on
// what was there at the start and on additions used 180 days or more, half
// rate on additions used less than 180 days (Income-tax Act rule).
export function depreciation({ openingWdv = 0, additions = [], rate = 0, fyEnd }) {
  const end = new Date(`${fyEnd}T00:00:00Z`);
  let dep = (Number(openingWdv) || 0) * rate / 100;
  for (const a of additions) {
    const days = Math.round((end - new Date(`${a.date}T00:00:00Z`)) / 86400000) + 1;
    dep += (Number(a.amount) || 0) * (rate / 100) * (days >= 180 ? 1 : 0.5);
  }
  return r2(Math.max(0, dep));
}
