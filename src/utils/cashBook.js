/*
 * v1.10.83 - the cash book: money in and money out in cash, with cash in hand.
 *
 * Asked for: "enter any cash entries or any raw entries of cash with names or
 * notes". Two kinds of lines:
 *   - the user's own entries (data/cash-book), each Money in or Money out;
 *   - cash already recorded elsewhere in the app, shown read-only so nothing
 *     is typed twice: invoice payments, payment receipts, expenses paid in
 *     cash and (v1.10.83, #123) cash payments to suppliers on purchase bills.
 *     A supplier payment has no other record (no receipt or expense is made
 *     for it), so it is one line as it stands.
 *
 * An invoice payment and its receipt are usually the SAME money (recording a
 * payment on the Dashboard saves a receipt; a receipt against an invoice adds
 * a payment to it). They are paired the way the Dashboard reconciles them, and
 * a pair is one line. See scripts/cashbook-test.mjs.
 *
 * Pure: no React, no storage, so the server validates with the same rules.
 * ponytail: rupees only; a foreign-currency invoice or receipt is left out.
 */
import { belongsToProfile, getFinancialYearStart, toLocalIsoDate, isCancelledBill } from '../utils.js';

// Divtech Hisaab - the Bank book (bank, UPI, cheque, card) uses the same
// records and rules; its own entries carry book: 'bank'.
export const BANK_CATEGORIES = ['Opening balance', 'Cash withdrawal', 'Bank charges', 'Interest', 'Transfer', 'Other'];
// The categories that move money between the two books (a contra entry).
export const DEPOSIT_TO_BANK = 'Deposit to bank';
export const CASH_WITHDRAWAL = 'Cash withdrawal';
export const CASH_CATEGORIES = ['Opening balance', 'Sales', 'Advance', 'Salary', 'Tea & snacks', 'Transport', 'Owner drawing', 'Deposit to bank', 'Other'];

const MAX_AMOUNT = 1e11;
const LIMITS = { name: 120, note: 500, category: 60 };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const isIsoDate = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''));
  if (!m) return false;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dt.getMonth() === Number(m[2]) - 1 && dt.getDate() === Number(m[3]);
};

// '' when the entry can be saved, else what to fix, in words for the user.
export function validateCashEntry(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return 'Invalid entry';
  if (e.id !== undefined && (typeof e.id !== 'string' || !e.id.trim())) return 'Invalid entry';
  if (e.type !== 'in' && e.type !== 'out') return 'Choose Money in or Money out';
  const amount = typeof e.amount === 'string' ? Number(e.amount) : e.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || r2(amount) <= 0) return 'Enter an amount more than 0';
  if (amount > MAX_AMOUNT) return 'The amount is too large';
  if (!isIsoDate(e.date)) return 'Enter a date';
  for (const [k, max] of Object.entries(LIMITS)) {
    if (e[k] !== undefined && e[k] !== null && typeof e[k] !== 'string') return 'Invalid entry';
    if (str(e[k]).length > max) return `The ${k} is too long (${max} letters at most)`;
  }
  return '';
}

// The record as stored: only known fields, trimmed, amount to the paisa.
// Call validateCashEntry first.
export function cleanCashEntry(e) {
  return {
    ...(e.id ? { id: e.id } : {}),
    type: e.type,
    date: e.date,
    amount: r2(e.amount),
    name: str(e.name),
    note: str(e.note),
    category: str(e.category),
    ...(e.book === 'bank' ? { book: 'bank' } : {}),
    ownerGstin: str(e.ownerGstin),
    ownerName: str(e.ownerName),
    createdAt: str(e.createdAt) || new Date().toISOString(),
    ...(e.updatedAt ? { updatedAt: str(e.updatedAt) } : {}),
  };
}

const isCash = (mode) => String(mode || '').trim().toLowerCase() === 'cash';
// Bank, UPI, cheque and card all go through the bank account.
const BANK_MODES = ['bank-transfer', 'bank', 'upi', 'cheque', 'card', 'neft', 'rtgs', 'imps', 'online', 'net-banking'];
export const isBankMode = (mode) => BANK_MODES.includes(String(mode || '').trim().toLowerCase().replace(/\s+/g, '-'));
export const bookOfEntry = (e) => (e?.book === 'bank' ? 'bank' : 'cash');
const inRupees = (currency) => !currency || currency === 'INR';
const billCurrency = (b) => b?.currency || b?.data?.invoiceOptions?.currency || 'INR';
// As the Dashboard compares them: 'Bank Transfer' on a receipt is 'bank-transfer' on a payment.
const modeKey = (m) => String(m || '').toLowerCase().replace(' ', '-');

// Is receipt r the record of payment p on bill? Strong links first (the
// payment carries the receipt's id or number), then, for older records, the
// same amount, date and mode on a receipt against this invoice.
function linkedTo(r, bill) {
  const ref = r.billId || r.againstInvoice;
  return !!ref && (ref === bill.id || ref === bill.invoiceNumber)
    && belongsToProfile(bill, { gstin: r.ownerGstin, businessName: r.ownerName });
}
const strongMatch = (p, r, bill) => (r.id && p.id === r.id) || (linkedTo(r, bill) && !!r.receiptNo && p.receiptNo === r.receiptNo);
const weakMatch = (p, r, bill) => linkedTo(r, bill)
  && Math.abs((Number(p.amount) || 0) - (Number(r.amount) || 0)) < 0.005
  && p.date === r.date && modeKey(p.mode) === modeKey(r.paymentMode);

// Divtech Hisaab - a cancelled invoice is undone completely: the money taken
// on it is treated as given back, so it leaves cash in hand (or the bank) and
// the books. Returns a test for receipts recorded against a cancelled invoice
// (and against no invoice still in force with the same number). Undo cancel
// brings them back.
export function onCancelledBill(bills = []) {
  const cancelled = bills.filter(isCancelledBill);
  if (!cancelled.length) return () => false;
  const active = bills.filter((b) => !isCancelledBill(b));
  return (r) => cancelled.some((b) => linkedTo(r, b)) && !active.some((b) => linkedTo(r, b));
}

// Cash recorded elsewhere, as read-only lines. Pass this business's records.
// `view` is the screen the line was made on (to open it from the cash book).
// Invoice payments that have no receipt of their own, as [bill, payment]:
// a paired payment is counted once, as its receipt.
export function unpairedBillPayments({ bills = [], receipts = [] } = {}) {
  const paired = new Set(); // receipts that are the record of a payment
  // Pairs a payment with a receipt not yet taken; false when there is none.
  const pair = (match) => ([bill, p]) => {
    const r = receipts.find((x) => !paired.has(x) && match(p, x, bill));
    if (r) paired.add(r);
    return !!r;
  };
  const payments = bills.flatMap((bill) => (bill?.payments || bill?.data?.payments || []).map((p) => [bill, p]));
  return payments.filter((x) => !pair(strongMatch)(x)).filter((x) => !pair(weakMatch)(x));
}

export function linkedCashLines(src = {}) { return linkedMoneyLines(src, 'cash'); }
export function linkedBankLines(src = {}) { return linkedMoneyLines(src, 'bank'); }

// Money recorded elsewhere for one book ('cash' or 'bank'), as read-only lines.
export function linkedMoneyLines({ bills = [], receipts = [], expenses = [], purchases = [], openings = [] } = {}, book = 'cash') {
  const inBook = book === 'bank' ? isBankMode : isCash;
  // Divtech Hisaab - money through another bank or a CC account is in that
  // account's ledger, not in the Bank book.
  const otherAccount = (rec) => book === 'bank' && String(rec?.account || '').startsWith('acc:');
  // Payments on a cancelled invoice, and receipts against one, are not counted.
  const voided = onCancelledBill(bills);
  const unpaired = unpairedBillPayments({ bills: bills.filter((b) => !isCancelledBill(b)), receipts });
  // A paired payment is shown once, as its receipt (cash or not, as the
  // receipt says). An unpaired cash payment is shown from the invoice.
  const lines = [];
  for (const [bill, p] of unpaired) {
    if (!inBook(p.mode) || otherAccount(p) || !inRupees(billCurrency(bill)) || !(Number(p.amount) > 0)) continue;
    const no = bill.invoiceNumber || bill.id;
    lines.push({
      key: `payment:${bill.id}:${p.id || `${p.date}:${p.amount}`}`,
      source: 'payment', view: 'dashboard', label: `Invoice ${no} payment`,
      // A refund paid on a credit note is money going out.
      type: bill.invoiceType === 'credit-note' ? 'out' : 'in',
      date: p.date || bill.invoiceDate || '', amount: r2(p.amount),
      name: bill.clientName || bill.data?.client?.name || '', note: p.note || '', category: '',
      at: p.recordedAt || '',
    });
  }
  for (const r of receipts) {
    if (voided(r)) continue;
    if (!inBook(r.paymentMode) || otherAccount(r) || !inRupees(r.currency) || !(Number(r.amount) > 0)) continue;
    lines.push({
      key: `receipt:${r.id}`,
      source: 'receipt', view: 'receipts',
      label: [`Receipt ${r.receiptNo || ''}`.trim(), r.againstInvoice].filter(Boolean).join(' · '),
      type: 'in', date: r.date || '', amount: r2(r.amount),
      name: r.clientName || '', note: r.note || '', category: '', at: r.recordedAt || '',
    });
  }
  for (const e of expenses) {
    if (!inBook(e.paymentMode) || otherAccount(e) || !inRupees(e.currency) || !(Number(e.amount) > 0)) continue;
    lines.push({
      key: `expense:${e.id}`,
      source: 'expense', view: 'expenses', label: 'Expense',
      type: 'out', date: e.date || '', amount: r2(e.amount),
      name: e.vendorName || e.description || '',
      note: [e.vendorName ? e.description : '', e.note].filter(Boolean).join(' · '),
      category: e.category || '', at: '',
    });
  }
  for (const p of purchases) {
    for (const x of (Array.isArray(p?.payments) ? p.payments : [])) {
      if (!inBook(x?.mode) || otherAccount(x) || !(Number(x.amount) > 0)) continue;
      lines.push({
        key: `purchase:${p.id}:${x.id || `${x.date}:${x.amount}`}`,
        source: 'purchase', view: 'purchases', label: `Purchase bill ${p.invoiceNumber || p.id} payment`,
        type: 'out', date: x.date || p.date || '', amount: r2(x.amount),
        name: p.supplierName || '', note: [x.reference, x.note].filter(Boolean).join(' · '),
        category: '', at: x.recordedAt || '',
      });
    }
  }
  // Divtech Hisaab - payments against opening balances (a receipt against
  // one is already listed above as a receipt).
  for (const o of openings) {
    for (const x of (Array.isArray(o?.payments) ? o.payments : [])) {
      if (x?.receiptNo || !inBook(x?.mode) || otherAccount(x) || !(Number(x.amount) > 0)) continue;
      lines.push({
        key: `opening:${o.id}:${x.id || `${x.date}:${x.amount}`}`,
        source: 'opening', view: o.party === 'client' ? 'clients' : 'suppliers',
        label: 'Against opening balance',
        type: o.party === 'client' ? 'in' : 'out', date: x.date || '', amount: r2(x.amount),
        name: o.name || '', note: x.note || '', category: '', at: '',
      });
    }
  }
  return lines;
}

// Divtech Hisaab - the other side of a contra entry: cash deposited in the
// bank shows as money in on the Bank book, a cash withdrawal as money in on
// the Cash book. Pass every own entry of this business (both books).
export const contraLines = (entries = [], book = 'cash') => entries
  .filter((e) => bookOfEntry(e) !== book && e.type === 'out'
    && e.category === (book === 'bank' ? DEPOSIT_TO_BANK : CASH_WITHDRAWAL))
  .map((e) => ({
    key: `contra:${e.id}`, source: 'contra', view: book === 'bank' ? 'cashbook' : 'bankbook',
    label: book === 'bank' ? 'Cash deposited (Cash book)' : 'Cash withdrawn (Bank book)',
    type: 'in', date: e.date || '', amount: r2(e.amount),
    name: e.name || '', note: e.note || '', category: e.category, at: e.createdAt || '',
  }));

// The user's own entries as lines.
export const ownCashLines = (entries = []) => entries.map((e) => ({
  key: `own:${e.id}`, source: 'own', view: '', label: '',
  type: e.type, date: e.date || '', amount: r2(e.amount),
  name: e.name || '', note: e.note || '', category: e.category || '', at: e.createdAt || '', entry: e,
}));

const signed = (l) => (l.type === 'out' ? -l.amount : l.amount);
// Same day: in the order entered where known, money in before money out otherwise.
const byDate = (a, b) => a.date.localeCompare(b.date) || String(a.at).localeCompare(String(b.at))
  || (a.type === b.type ? 0 : a.type === 'in' ? -1 : 1) || a.key.localeCompare(b.key);

// Money in and out, and the change, of some lines.
export function cashTotals(lines) {
  const tIn = lines.reduce((s, l) => s + (l.type === 'in' ? l.amount : 0), 0);
  const tOut = lines.reduce((s, l) => s + (l.type === 'out' ? l.amount : 0), 0);
  return { in: r2(tIn), out: r2(tOut), net: r2(tIn - tOut) };
}

// The book for a period: the balance brought in, the lines oldest first, each
// with the balance after it, and the balance carried out. `from` / `to` are
// YYYY-MM-DD ('' = no limit). Search narrows the lines shown and their totals;
// each line keeps its true balance, and opening / closing stay the period's.
export function cashBookView(lines, { from = '', to = '', search = '' } = {}) {
  const sorted = [...lines].sort(byDate);
  let bal = 0;
  const withBal = sorted.map((l) => { bal = r2(bal + signed(l)); return { ...l, balance: bal }; });
  const opening = r2(withBal.filter((l) => from && l.date < from).reduce((s, l) => s + signed(l), 0));
  const period = withBal.filter((l) => (!from || l.date >= from) && (!to || l.date <= to));
  const closing = r2(opening + cashTotals(period).net);
  const q = String(search || '').trim().toLowerCase();
  const rows = q
    ? period.filter((l) => [l.name, l.note, l.category, l.label, String(l.amount)].some((v) => String(v || '').toLowerCase().includes(q)))
    : period;
  return { opening, rows, totals: cashTotals(rows), closing };
}

// The cards at the top: cash in hand now, and today's and this month's in / out.
export function cashSummary(lines, today = toLocalIsoDate(new Date())) {
  const month = today.slice(0, 7);
  return {
    inHand: cashTotals(lines.filter((l) => l.date <= today)).net,
    today: cashTotals(lines.filter((l) => l.date === today)),
    month: cashTotals(lines.filter((l) => l.date.slice(0, 7) === month)),
  };
}

// Date filter presets. 'custom' and 'all' leave the dates to the caller.
export function periodRange(kind, today = toLocalIsoDate(new Date())) {
  const [y, m] = today.split('-').map(Number);
  const lastDay = (yy, mm) => new Date(yy, mm, 0).getDate();
  const pad = (n) => String(n).padStart(2, '0');
  if (kind === 'month') return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${lastDay(y, m)}` };
  if (kind === 'lastMonth') {
    const ly = m === 1 ? y - 1 : y, lm = m === 1 ? 12 : m - 1;
    return { from: `${ly}-${pad(lm)}-01`, to: `${ly}-${pad(lm)}-${lastDay(ly, lm)}` };
  }
  if (kind === 'fy') {
    const fy = getFinancialYearStart(new Date(y, m - 1, 1));
    return { from: `${fy}-04-01`, to: `${fy + 1}-03-31` };
  }
  return { from: '', to: '' };
}

// Divtech Hisaab - voucher lines on the cash or bank account (a loan received
// in cash, a CC deposit made from the bank...), as read-only lines.
export const voucherMoneyLines = (vouchers = [], book = 'cash') => vouchers.flatMap((v) => (v.lines || [])
  .map((l, i) => [l, i])
  .filter(([l]) => l.account === book && (Number(l.dr) > 0 || Number(l.cr) > 0))
  .map(([l, i]) => ({
    key: `voucher:${v.id}:${i}`, source: 'voucher', view: 'vouchers', label: `Voucher ${v.number || ''}`.trim(),
    type: Number(l.dr) > 0 ? 'in' : 'out', date: v.date || '', amount: r2(Number(l.dr) || Number(l.cr)),
    name: (v.lines || []).filter((x) => x !== l).map((x) => String(x.account).replace(/^(client|supplier|expense|acc|cashcat):/, '')).join(', '),
    note: v.narration || '', category: '', at: v.createdAt || '',
  })));
