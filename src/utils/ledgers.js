// Divtech Hisaab - ledgers, worked out from the documents already saved
// (invoices, credit notes, receipts, purchase bills and their payments,
// expenses, the cash / bank book, opening balances). Nothing is posted twice:
// each ledger reads the same records the rest of the app uses.
//
// Ledgers (id -> what it shows):
//   client:<name>    a customer's account: sales Dr, receipts / credit notes Cr
//   supplier:<name>  a supplier's account: purchases Cr, payments Dr
//   item:<productId> an item: quantity in / out, value WITHOUT GST, average cost
//   gst:all | gst:cgst | gst:sgst | gst:igst | gst:cess
//                    output tax on sales Cr, input tax on purchases Dr
//   cash | bank      money in Dr, money out Cr (the Cash / Bank book)
//   sales | purchases | expenses   value without GST
//
// Rupees only: invoices in another currency are left out of these ledgers.
import { salesSign, isCancelledBill, amountDue, calculateLineItemTax } from '../utils.js';
import { purchaseTotals } from './purchaseOrders.js';
import { purchaseOwed, purchaseTotal, hasPurchasePayments, purchaseStatus } from './purchasePayments.js';
import { partyKey, OPENING_REF } from './openingBalances.js';
import { unpairedBillPayments, bookOfEntry, isBankMode, DEPOSIT_TO_BANK, CASH_WITHDRAWAL } from './cashBook.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const r3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
const inr = (b) => (b?.currency || b?.data?.invoiceOptions?.currency || 'INR') === 'INR';
const isBill = (p) => (p?.kind || 'bill') !== 'po';
const HEADS = ['cgst', 'sgst', 'igst', 'cess'];
const docLabel = { 'tax-invoice': 'Sale', 'bill-of-supply': 'Sale (bill of supply)', composition: 'Sale (composition)', 'credit-note': 'Credit note' };

// ---- GST of one invoice / purchase ------------------------------------------
export function billGst(bill) {
  const t = bill?.data?.totals || {};
  const inter = typeof t.isInterstate === 'boolean' ? t.isInterstate : (Number(t.igst) > 0 && !Number(t.cgst));
  return {
    cgst: inter ? 0 : r2(t.cgst),
    sgst: inter ? 0 : r2((Number(t.sgst) || 0) + (Number(t.utgst) || 0)),
    igst: inter ? r2(t.igst) : 0,
    cess: r2(t.cess),
  };
}
export function billTaxable(bill) {
  const t = bill?.data?.totals || {};
  if (t.taxableAmount !== undefined && t.taxableAmount !== null) return r2(t.taxableAmount);
  if (t.subtotal !== undefined) return r2((Number(t.subtotal) || 0) - (Number(t.totalDiscount) || 0));
  const g = billGst(bill);
  return r2((Number(bill?.totalAmount) || 0) - g.cgst - g.sgst - g.igst - g.cess);
}
// A purchase from an unregistered dealer (URD) gives no input tax credit.
export const isUrdPurchase = (p) => !!p?.purchaseType?.urd;
export function purchaseGst(p) {
  const t = purchaseTotals(p?.items || [], !!p?.applyRoundOff);
  const tax = r2(t.tax);
  const half = r2(tax / 2);
  return p?.interstate
    ? { cgst: 0, sgst: 0, igst: tax, cess: r2(t.cess), taxable: r2(t.taxable) }
    : { cgst: half, sgst: r2(tax - half), igst: 0, cess: r2(t.cess), taxable: r2(t.taxable) };
}

// ---- running balance ------------------------------------------------------------
// entries: { key, date, particulars, ref, dr, cr, view? }. Balance is Dr - Cr.
// `from` / `to` are YYYY-MM-DD ('' = no limit).
export function ledgerView(entries, { from = '', to = '' } = {}) {
  const sorted = [...entries].map((e, i) => ({ ...e, i })).sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.i - b.i);
  const opening = r2(sorted.filter((e) => from && e.date < from).reduce((s, e) => s + (e.dr || 0) - (e.cr || 0), 0));
  let bal = opening;
  const rows = sorted.filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
    .map((e) => { bal = r2(bal + (e.dr || 0) - (e.cr || 0)); return { ...e, dr: r2(e.dr), cr: r2(e.cr), balance: bal }; });
  const dr = r2(rows.reduce((s, e) => s + e.dr, 0));
  const cr = r2(rows.reduce((s, e) => s + e.cr, 0));
  return { opening, rows, totals: { dr, cr }, closing: r2(opening + dr - cr) };
}
// "1,200.00 Dr" style sides.
export const side = (bal) => (bal > 0.005 ? 'Dr' : bal < -0.005 ? 'Cr' : '');

// ---- accounts -----------------------------------------------------------------
// Divtech Hisaab - double entry. Every saved document becomes balanced postings
// (debit = credit), and every ledger, the trial balance, the profit and loss
// account and the balance sheet read the same postings. Accounts:
//   client:<name> supplier:<name>  customers and suppliers
//   cash bank                      the Cash book and the Bank book
//   acc:<id>                       your own accounts: capital, loans, CC / OD,
//                                  fixed assets, loans given, deposits...
//   sales purchases expense:<category>
//   gst:cgst gst:sgst gst:igst gst:cess   input and output tax (net)
//   tds-receivable tds-payable tcs-payable round-off interest advances drawings
//   cashcat:<category>             other cash / bank book entries
//   stock                          opening stock brought in
//   opening-diff                   difference in opening balances
//   suspense                       money in other modes (not cash or bank)
// Groups place each account in the final accounts.
export const ACCOUNT_GROUPS = {
  capital: { name: 'Capital account', side: 'liability' },
  'secured-loans': { name: 'Secured loans', side: 'liability' },
  'unsecured-loans': { name: 'Unsecured loans', side: 'liability' },
  cc: { name: 'Bank OD / CC accounts', side: 'liability' },
  'sundry-creditors': { name: 'Sundry creditors', side: 'liability' },
  'duties-taxes': { name: 'Duties and taxes', side: 'liability' },
  'current-liabilities': { name: 'Current liabilities and provisions', side: 'liability' },
  'fixed-assets': { name: 'Fixed assets', side: 'asset' },
  investments: { name: 'Investments', side: 'asset' },
  'loans-advances': { name: 'Loans and advances (given)', side: 'asset' },
  deposits: { name: 'Deposits (asset)', side: 'asset' },
  'sundry-debtors': { name: 'Sundry debtors', side: 'asset' },
  'cash-in-hand': { name: 'Cash in hand', side: 'asset' },
  'bank-accounts': { name: 'Bank accounts', side: 'asset' },
  'current-assets': { name: 'Other current assets', side: 'asset' },
  sales: { name: 'Sales', side: 'income', trading: true },
  'direct-incomes': { name: 'Direct incomes', side: 'income', trading: true },
  purchases: { name: 'Purchases', side: 'expense', trading: true },
  'direct-expenses': { name: 'Direct expenses', side: 'expense', trading: true },
  'indirect-incomes': { name: 'Indirect incomes', side: 'income' },
  'indirect-expenses': { name: 'Indirect expenses', side: 'expense' },
  stock: { name: 'Opening stock', side: 'stock' },
  suspense: { name: 'Suspense', side: 'liability' },
};
// Groups you can put your own accounts in (Accounts screen).
export const USER_GROUPS = ['capital', 'secured-loans', 'unsecured-loans', 'cc', 'fixed-assets', 'investments', 'loans-advances', 'deposits', 'current-assets', 'current-liabilities', 'indirect-incomes', 'indirect-expenses', 'direct-expenses', 'direct-incomes'];
export const isPnlGroup = (g) => ['income', 'expense'].includes(ACCOUNT_GROUPS[g]?.side);

const SYSTEM = {
  cash: ['Cash', 'cash-in-hand'], bank: ['Bank', 'bank-accounts'], sales: ['Sales', 'sales'], purchases: ['Purchases', 'purchases'],
  'gst:cgst': ['CGST', 'duties-taxes'], 'gst:sgst': ['SGST / UTGST', 'duties-taxes'], 'gst:igst': ['IGST', 'duties-taxes'], 'gst:cess': ['GST cess', 'duties-taxes'],
  'tds-receivable': ['TDS deducted by customers', 'current-assets'], 'tds-payable': ['TDS deducted from suppliers (payable)', 'duties-taxes'],
  'tcs-payable': ['TCS collected (payable)', 'duties-taxes'], 'round-off': ['Round off', 'indirect-expenses'],
  interest: ['Bank interest', 'indirect-expenses'], advances: ['Advances (cash / bank book)', 'loans-advances'], drawings: ['Drawings', 'capital'],
  stock: ['Opening stock', 'stock'], 'opening-diff': ['Difference in opening balances', 'capital'], suspense: ['Suspense (money in other modes)', 'suspense'],
};
// Expense categories that are part of buying goods (trading account).
const DIRECT_EXPENSES = ['freight', 'freight inward', 'cartage', 'loading', 'unloading', 'carriage inward', 'packing'];

// Name and group of an account id. `accounts`: your own accounts.
export function accountInfo(id, accounts = []) {
  if (SYSTEM[id]) return { id, name: SYSTEM[id][0], group: SYSTEM[id][1] };
  const [type, ...rest] = String(id).split(':');
  const arg = rest.join(':');
  if (type === 'client') return { id, name: arg, group: 'sundry-debtors', party: 'client' };
  if (type === 'supplier') return { id, name: arg, group: 'sundry-creditors', party: 'supplier' };
  if (type === 'expense') return { id, name: arg || 'General expenses', group: DIRECT_EXPENSES.includes(arg.toLowerCase()) ? 'direct-expenses' : 'indirect-expenses' };
  if (type === 'cashcat') return { id, name: `${arg} (cash / bank book)`, group: 'indirect-expenses' };
  if (type === 'acc') {
    const a = accounts.find((x) => x.id === arg);
    return { id, name: a?.name || 'Deleted account', group: a?.group && ACCOUNT_GROUPS[a.group] ? a.group : 'suspense', account: a || null };
  }
  return { id, name: id, group: 'suspense' };
}

// Where money of a payment mode goes. A CC / OD or other account picked as the
// mode ('acc:<id>') goes there; bank, UPI, cheque and card to the bank; others
// (Other, adjustments) to suspense.
export const modeAccount = (mode) => {
  const m = String(mode || '').trim();
  if (m.startsWith('acc:')) return m;
  if (m.toLowerCase() === 'cash') return 'cash';
  if (isBankMode(m)) return 'bank';
  return 'suspense';
};
const CATEGORY_ACCOUNT = {
  'opening balance': 'opening-diff', sales: 'sales', 'owner drawing': 'drawings', advance: 'advances',
  interest: 'interest', transfer: 'suspense',
  salary: 'expense:Salary', 'tea & snacks': 'expense:Tea & snacks', transport: 'expense:Transport', 'bank charges': 'expense:Bank charges',
};

// All postings of this business's records: [{ key, doc, account, date,
// particulars, ref, dr, cr, view }]. Rupee documents only.
export function postings({ bills = [], receipts = [], purchases = [], expenses = [], openings = [], cashEntries = [], vouchers = [], accounts = [], products = [] } = {}) {
  const out = [];
  // amount > 0 debits the account, < 0 credits it.
  const post = (doc, account, amount, date, particulars, ref = '', view = '', key = '') => {
    const a = r2(amount);
    if (Math.abs(a) < 0.005) return;
    out.push({ key: key || `${doc}:${account}:${out.length}`, doc, account, date: date || '', particulars, ref, dr: a > 0 ? a : 0, cr: a < 0 ? -a : 0, view });
  };
  const clientAcc = (n) => `client:${String(n || '').trim() || 'Customer (no name)'}`;
  const supplierAcc = (n) => `supplier:${String(n || '').trim() || 'Supplier (no name)'}`;

  // Opening balances of customers and suppliers.
  for (const o of openings) {
    const amt = Number(o.amount) || 0;
    if (o.party === 'client') {
      const s = o.direction === 'advance' ? -1 : 1;
      post(`ob:${o.id}`, clientAcc(o.name), s * amt, o.asOn, s > 0 ? 'Opening balance' : 'Opening balance (advance)', '', 'clients', `ob:${o.id}`);
      post(`ob:${o.id}`, 'opening-diff', -s * amt, o.asOn, `Opening balance - ${o.name}`, '', 'clients');
      for (const x of o.payments || []) {
        if (x.receiptNo) continue; // the receipt is posted below
        post(`obp:${o.id}:${x.id}`, clientAcc(o.name), -x.amount, x.date, `Received against opening balance (${x.mode || 'payment'})`, x.note || '', 'clients', `obp:${o.id}:${x.id}`);
        post(`obp:${o.id}:${x.id}`, modeAccount(x.mode), x.amount, x.date, `Received against opening balance - ${o.name}`, x.note || '', 'clients');
      }
    } else if (o.party === 'supplier') {
      const s = o.direction === 'advance' ? 1 : -1;
      post(`ob:${o.id}`, supplierAcc(o.name), s * amt, o.asOn, s < 0 ? 'Opening balance' : 'Opening balance (advance paid)', '', 'suppliers', `ob:${o.id}`);
      post(`ob:${o.id}`, 'opening-diff', -s * amt, o.asOn, `Opening balance - ${o.name}`, '', 'suppliers');
      for (const x of o.payments || []) {
        post(`obp:${o.id}:${x.id}`, supplierAcc(o.name), x.amount, x.date, `Paid against opening balance (${x.mode || 'payment'})`, x.note || '', 'suppliers', `obp:${o.id}:${x.id}`);
        post(`obp:${o.id}:${x.id}`, modeAccount(x.mode), -x.amount, x.date, `Paid against opening balance - ${o.name}`, x.note || '', 'suppliers');
      }
    }
  }

  // Sales invoices and credit notes.
  const salesBills = bills.filter((b) => inr(b) && salesSign(b) !== 0);
  for (const b of salesBills) {
    const s = salesSign(b);
    const doc = `bill:${b.id}`;
    const total = Number(b.totalAmount) || 0;
    const name = b.clientName || b.data?.client?.name;
    const type = docLabel[b.invoiceType || 'tax-invoice'] || 'Sale';
    const saleType = b.data?.details?.saleType?.name;
    const taxable = billTaxable(b);
    const g = billGst(b);
    const tcs = Number(b.data?.totals?.tcsAmount) || 0;
    post(doc, clientAcc(name), s * total, b.invoiceDate, saleType && s > 0 ? `${type} (${saleType})` : type, b.invoiceNumber, 'dashboard', doc);
    post(doc, 'sales', -s * taxable, b.invoiceDate, `${s > 0 ? 'Sale' : 'Credit note'} - ${name || ''}`, b.invoiceNumber, 'dashboard');
    for (const h of HEADS) post(doc, `gst:${h}`, -s * g[h], b.invoiceDate, `${s > 0 ? 'Output tax on sale' : 'Output tax reversed (credit note)'} - ${name || ''}`, b.invoiceNumber, 'dashboard');
    post(doc, 'tcs-payable', -s * tcs, b.invoiceDate, `TCS collected - ${name || ''}`, b.invoiceNumber, 'dashboard');
    post(doc, 'round-off', -s * (total - taxable - HEADS.reduce((t, h) => t + g[h], 0) - tcs), b.invoiceDate, `Round off - ${name || ''}`, b.invoiceNumber, 'dashboard');
    const tds = s > 0 ? r2(total - amountDue(b)) : 0;
    if (tds > 0.005) {
      post(`tds:${b.id}`, clientAcc(name), -tds, b.invoiceDate, 'TDS deducted by the customer', b.invoiceNumber, 'dashboard', `tds:${b.id}`);
      post(`tds:${b.id}`, 'tds-receivable', tds, b.invoiceDate, `TDS deducted by ${name || 'the customer'}`, b.invoiceNumber, 'dashboard');
    }
    // A bill marked Paid before payments were recorded one by one.
    if (s > 0 && b.status === 'paid' && !(b.payments || []).length && !receipts.some((r) => r.againstInvoice === b.invoiceNumber)) {
      post(`markpaid:${b.id}`, clientAcc(name), -amountDue(b), b.invoiceDate, 'Marked paid', b.invoiceNumber, 'dashboard', `markpaid:${b.id}`);
      post(`markpaid:${b.id}`, 'suspense', amountDue(b), b.invoiceDate, `Marked paid - ${name || ''}`, b.invoiceNumber, 'dashboard');
    }
  }
  // Payments recorded on invoices that have no receipt of their own.
  for (const [b, p] of unpairedBillPayments({ bills: salesBills, receipts })) {
    const amt = Number(p.amount) || 0;
    if (!(amt > 0)) continue;
    const refund = salesSign(b) < 0;
    const doc = `pay:${b.id}:${p.id || p.date}`;
    const name = b.clientName || b.data?.client?.name;
    post(doc, clientAcc(name), refund ? amt : -amt, p.date || b.invoiceDate, `${refund ? 'Refund paid' : 'Received'} (${p.mode || 'payment'})`, b.invoiceNumber, 'dashboard', doc);
    post(doc, modeAccount(p.mode), refund ? -amt : amt, p.date || b.invoiceDate, `Invoice ${b.invoiceNumber || b.id} ${refund ? 'refund' : 'payment'} - ${name || ''}`, p.note || '', 'dashboard');
  }
  // Receipts.
  for (const r of receipts) {
    const amt = Number(r.amount) || 0;
    if ((r.currency && r.currency !== 'INR') || !(amt > 0)) continue;
    const onOpening = String(r.againstInvoice || '').trim().toLowerCase() === OPENING_REF.toLowerCase();
    const doc = `rcp:${r.id}`;
    const ref = [r.receiptNo, onOpening ? '' : r.againstInvoice].filter(Boolean).join(' · ');
    post(doc, clientAcc(r.clientName), -amt, r.date, `Receipt (${r.paymentMode || 'payment'})${onOpening ? ' against opening balance' : ''}`, ref, 'receipts', doc);
    post(doc, modeAccount(r.paymentMode), amt, r.date, `Receipt ${r.receiptNo || ''} - ${r.clientName || ''}`.replace(/\s+-\s*$/, ''), r.note || '', 'receipts');
  }

  // Purchase bills and payments to suppliers.
  for (const p of purchases) {
    if (!isBill(p)) continue;
    const doc = `pur:${p.id}`;
    const total = r2(purchaseTotal(p));
    const g = purchaseGst(p);
    const gsum = HEADS.reduce((t, h) => t + g[h], 0);
    const urd = isUrdPurchase(p);
    const type = p.purchaseType?.name ? `Purchase (${p.purchaseType.name})` : 'Purchase';
    post(doc, supplierAcc(p.supplierName), -total, p.date, type, p.invoiceNumber, 'purchases', doc);
    // GST on a URD bill is not claimed: it is part of the cost.
    post(doc, 'purchases', g.taxable + (urd ? gsum : 0), p.date, `Purchase - ${p.supplierName || ''}`, p.invoiceNumber, 'purchases');
    if (!urd) for (const h of HEADS) post(doc, `gst:${h}`, g[h], p.date, `Input tax on purchase - ${p.supplierName || ''}`, p.invoiceNumber, 'purchases');
    post(doc, 'round-off', total - g.taxable - gsum, p.date, `Round off - ${p.supplierName || ''}`, p.invoiceNumber, 'purchases');
    const tds = r2(total - purchaseOwed(p));
    if (tds > 0.005) {
      post(`ptds:${p.id}`, supplierAcc(p.supplierName), tds, p.date, 'TDS deducted by you', p.invoiceNumber, 'purchases', `ptds:${p.id}`);
      post(`ptds:${p.id}`, 'tds-payable', -tds, p.date, `TDS deducted from ${p.supplierName || 'the supplier'}`, p.invoiceNumber, 'purchases');
    }
    if (hasPurchasePayments(p)) {
      for (const x of p.payments) {
        const pdoc = `ppay:${p.id}:${x.id}`;
        post(pdoc, supplierAcc(p.supplierName), x.amount, x.date || p.date, `Paid (${x.mode || 'payment'})`, [p.invoiceNumber, x.reference].filter(Boolean).join(' · '), 'purchases', pdoc);
        post(pdoc, modeAccount(x.mode), -x.amount, x.date || p.date, `Purchase bill ${p.invoiceNumber || p.id} payment - ${p.supplierName || ''}`, x.reference || '', 'purchases');
      }
    } else if (purchaseStatus(p) === 'Paid') {
      post(`pmark:${p.id}`, supplierAcc(p.supplierName), purchaseOwed(p), p.date, 'Marked paid', p.invoiceNumber, 'purchases', `pmark:${p.id}`);
      post(`pmark:${p.id}`, 'suspense', -purchaseOwed(p), p.date, `Marked paid - ${p.supplierName || ''}`, p.invoiceNumber, 'purchases');
    }
  }

  // Expenses (paid when entered, in their payment mode).
  for (const e of expenses) {
    if ((e.currency && e.currency !== 'INR') || !(Number(e.amount) > 0)) continue;
    const doc = `exp:${e.id}`;
    const gst = Number(e.gstAmount) || 0;
    const half = r2(gst / 2);
    const split = e.interstate ? { igst: gst, cgst: 0, sgst: 0, cess: 0 } : { cgst: half, sgst: r2(gst - half), igst: 0, cess: 0 };
    const who = e.vendorName || e.description || '';
    post(doc, `expense:${e.category || 'General expenses'}`, (Number(e.amount) || 0) - gst, e.date, [e.category, who].filter(Boolean).join(' - ') || 'Expense', e.invoiceNumber || '', 'expenses', doc);
    for (const h of HEADS) post(doc, `gst:${h}`, split[h], e.date, `Input tax on expense - ${e.vendorName || e.category || ''}`, e.invoiceNumber || '', 'expenses');
    post(doc, modeAccount(e.paymentMode), -(Number(e.amount) || 0), e.date, `Expense - ${who}`.replace(/\s+-\s*$/, ''), [e.category, e.note].filter(Boolean).join(' · '), 'expenses');
  }

  // Your own Cash book and Bank book entries.
  for (const e of cashEntries) {
    const book = bookOfEntry(e);
    const s = e.type === 'in' ? 1 : -1;
    const amt = Number(e.amount) || 0;
    const cat = String(e.category || '').trim();
    const doc = `cb:${e.id}`;
    let other;
    if (book === 'cash' && s < 0 && cat === DEPOSIT_TO_BANK) other = 'bank';
    else if (book === 'bank' && s < 0 && cat === CASH_WITHDRAWAL) other = 'cash';
    else other = e.account || CATEGORY_ACCOUNT[cat.toLowerCase()] || `cashcat:${cat || 'Other'}`;
    const label = [cat || (s > 0 ? 'Money in' : 'Money out'), e.name].filter(Boolean).join(' - ');
    post(doc, book, s * amt, e.date, label, e.note || '', book === 'bank' ? 'bankbook' : 'cashbook', doc);
    post(doc, other, -s * amt, e.date, `${book === 'bank' ? 'Bank' : 'Cash'} book: ${label}`, e.note || '', book === 'bank' ? 'bankbook' : 'cashbook');
  }

  // Vouchers (payment, receipt, contra, journal).
  for (const v of vouchers) {
    for (const [i, l] of (v.lines || []).entries()) {
      post(`v:${v.id}`, l.account, (Number(l.dr) || 0) - (Number(l.cr) || 0), v.date, v.narration || VOUCHER_LABEL[v.type] || 'Journal', v.number || '', 'vouchers', `v:${v.id}:${i}`);
    }
  }

  // Your own accounts' opening balances.
  for (const a of accounts) {
    const amt = (Number(a.opening) || 0) * (a.openingSide === 'Cr' ? -1 : 1);
    post(`acc:${a.id}`, `acc:${a.id}`, amt, a.asOn || '', 'Opening balance', '', 'accounts', `accob:${a.id}`);
    post(`acc:${a.id}`, 'opening-diff', -amt, a.asOn || '', `Opening balance - ${a.name}`, '', 'accounts');
  }

  // Opening stock: what was in stock before its first purchase or sale here.
  for (const pr of products) {
    if (pr?.kind === 'service') continue;
    const first = itemLedger(pr, { bills, purchases }).rows[0];
    if (!first || Math.abs(first.value) < 0.005) continue;
    post(`os:${pr.id}`, 'stock', first.value, first.date, `Opening stock - ${pr.name}`, '', 'inventory', `os:${pr.id}`);
    post(`os:${pr.id}`, 'opening-diff', -first.value, first.date, `Opening stock - ${pr.name}`, '', 'inventory');
  }
  return out;
}
export const VOUCHER_LABEL = { payment: 'Payment', receipt: 'Receipt', contra: 'Contra', journal: 'Journal' };

// Postings of one account (or, for an id ending in ':*', every account that
// starts with it), as ledger entries.
export function accountEntries(id, all) {
  const want = id.endsWith('*') ? (a) => a.startsWith(id.slice(0, -1)) : (a) => a === id;
  return all.filter((p) => want(p.account));
}
const byPartyKey = (prefix, name) => (p) => p.account.startsWith(prefix) && partyKey(p.account.slice(prefix.length)) === partyKey(name);

// ---- ledgers (views of the postings) -------------------------------------------
export const clientLedger = (name, data = {}) => postings(data).filter(byPartyKey('client:', name));
export const supplierLedger = (name, data = {}) => postings(data).filter(byPartyKey('supplier:', name));
// 'all' merges a document's CGST, SGST, IGST and cess into one line.
export function gstLedger(head = 'all', data = {}) {
  const rows = postings(data).filter((p) => (head === 'all' ? p.account.startsWith('gst:') : p.account === `gst:${head}`));
  if (head !== 'all') return rows;
  const merged = new Map();
  for (const p of rows) {
    const k = `${p.doc}|${p.particulars}`;
    const m = merged.get(k);
    if (m) { m.dr = r2(m.dr + p.dr); m.cr = r2(m.cr + p.cr); } else merged.set(k, { ...p, key: `${p.doc}:gst` });
  }
  return [...merged.values()].map((m) => { const net = r2(m.dr - m.cr); return { ...m, dr: net > 0 ? net : 0, cr: net < 0 ? -net : 0 }; });
}
export const salesLedger = (data = {}) => postings(data).filter((p) => p.account === 'sales');
export const purchasesLedger = (data = {}) => postings(data).filter((p) => p.account === 'purchases');
export const expensesLedger = (data = {}) => postings(data).filter((p) => p.account.startsWith('expense:'));
export const moneyLedger = (book, data = {}) => postings(data).filter((p) => p.account === book);

// ---- items: quantity, value without GST, average cost ------------------------
const STOCK_SIGN = { 'tax-invoice': -1, 'bill-of-supply': -1, composition: -1, 'delivery-challan': -1, 'credit-note': 1 };
const itemKey = (line) => (line?.productId ? `id:${line.productId}` : `name:${partyKey(line?.name)}`);
const productKeys = (product) => new Set([`id:${product.id}`, `name:${partyKey(product.name)}`]);

// Every stock movement of one product, oldest first, with the running quantity,
// average cost (weighted, from purchases) and stock value. The first row is the
// opening stock that makes the movements end at the product's current stock.
export function itemLedger(product, { bills = [], purchases = [] } = {}) {
  const keys = productKeys(product);
  const moves = [];
  for (const p of purchases) {
    if (!isBill(p)) continue;
    for (const [i, it] of (p.items || []).entries()) {
      if (!keys.has(itemKey(it))) continue;
      const qty = Number(it.quantity) || 0;
      if (!qty) continue;
      // Saving a purchase bill adds its lines to Products' stock by name.
      moves.push({ key: `pur:${p.id}:${i}`, date: p.date, kind: 'purchase', particulars: `Purchase - ${p.supplierName || ''}`, ref: p.invoiceNumber, qtyIn: qty, qtyOut: 0, rate: r2(it.rate), view: 'purchases', moved: true });
    }
  }
  for (const b of bills) {
    const sign = isCancelledBill(b) ? 0 : (STOCK_SIGN[b.invoiceType || 'tax-invoice'] ?? 0);
    if (!sign) continue;
    const incl = !!(b.data?.totals?.taxInclusive ?? b.data?.taxInclusive);
    for (const [i, it] of (b.data?.items || []).entries()) {
      if (!keys.has(itemKey(it))) continue;
      const qty = Number(it.quantity) || 0;
      if (!qty) continue;
      const value = b.invoiceType === 'delivery-challan' ? 0 : r2(calculateLineItemTax(it, incl).afterDiscount);
      const label = b.invoiceType === 'credit-note' ? 'Returned (credit note)' : b.invoiceType === 'delivery-challan' ? 'Sent (delivery challan)' : 'Sale';
      const kind = sign > 0 ? 'return' : b.invoiceType === 'delivery-challan' ? 'challan' : 'sale';
      moves.push({ key: `bill:${b.id}:${i}`, date: b.invoiceDate, kind, particulars: `${label} - ${b.clientName || ''}`, ref: b.invoiceNumber, qtyIn: sign > 0 ? qty : 0, qtyOut: sign < 0 ? qty : 0, rate: r2(qty ? value / qty : 0), saleValue: value, view: 'dashboard', billId: b.id, inr: inr(b),
        // An invoice moves Products' stock only for a line picked from the
        // product list; one typed by name is in the ledger but not in stock.
        moved: it.productId === product.id, ...(it.productId === product.id ? {} : { unlinked: true }) });
    }
  }
  moves.sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.qtyIn ? -1 : 1));
  const net = moves.filter((m) => m.moved).reduce((s, m) => s + m.qtyIn - m.qtyOut, 0);
  const current = Number(product.stock);
  const openingQty = Number.isFinite(current) && product.stock !== '' && product.stock !== null ? r3(current - net) : 0;
  const openingRate = r2(product.purchasePrice);
  let qty = openingQty;
  let avg = openingRate;
  const rows = [{ key: 'opening', date: moves[0]?.date || '', kind: 'opening', particulars: 'Opening stock', ref: '', qtyIn: openingQty > 0 ? openingQty : 0, qtyOut: openingQty < 0 ? -openingQty : 0, rate: openingRate, value: r2(openingQty * openingRate), balanceQty: openingQty, avgCost: avg, balanceValue: r2(openingQty * avg) }];
  for (const m of moves) {
    let cost = 0;
    if (m.kind === 'purchase') {
      const inValue = m.qtyIn * m.rate;
      avg = qty + m.qtyIn > 0 ? (Math.max(0, qty) * avg + inValue) / (Math.max(0, qty) + m.qtyIn) : m.rate;
      qty = r3(qty + m.qtyIn);
    } else if (m.kind === 'sale' || m.kind === 'challan') {
      cost = r2(m.qtyOut * avg);
      qty = r3(qty - m.qtyOut);
    } else {
      cost = -r2(m.qtyIn * avg); // goods back: the cost comes back too
      qty = r3(qty + m.qtyIn);
    }
    rows.push({ ...m, value: m.kind === 'purchase' ? r2(m.qtyIn * m.rate) : (m.saleValue || 0), cost, balanceQty: qty, avgCost: r2(avg), balanceValue: r2(qty * avg) });
  }
  return { product, unit: product.unit || '', rows, closingQty: qty, avgCost: r2(avg), closingValue: r2(qty * avg) };
}

// Cost of the goods sold in a period: each sale at the item's average purchase
// cost at that time (returns on credit notes take it back). Lines for products
// that are not in the product list, or have no cost at all, are counted in
// `noCost` and add nothing. Rupee invoices only.
export function costOfGoodsSold({ bills = [], purchases = [], products = [] } = {}, { from = '', to = '' } = {}) {
  let cost = 0;
  let noCost = 0;
  const byMonth = {};
  const inPeriod = (d) => (!from || d >= from) && (!to || d <= to);
  for (const product of products) {
    if (product?.kind === 'service') continue;
    const { rows } = itemLedger(product, { bills, purchases });
    for (const r of rows) {
      // A delivery challan moves goods but is not a sale.
      if ((r.kind !== 'sale' && r.kind !== 'return') || !inPeriod(r.date) || r.inr === false) continue;
      if (!r.avgCost) { noCost += 1; continue; }
      cost += r.cost;
      const m = String(r.date).slice(0, 7);
      byMonth[m] = r2((byMonth[m] || 0) + r.cost);
    }
  }
  return { cost: r2(cost), noCost, byMonth };
}

// ---- the list of ledgers to pick from ----------------------------------------
export function ledgerCatalog(data = {}) {
  const { clients = [], suppliers = [], products = [], accounts = [] } = data;
  const all = postings(data);
  const uniq = (names) => [...new Map(names.filter(Boolean).map((n) => [partyKey(n), String(n).trim()])).values()].sort((a, b) => a.localeCompare(b));
  const used = (prefix) => all.filter((p) => p.account.startsWith(prefix)).map((p) => p.account.slice(prefix.length));
  const clientNames = uniq([...clients.map((c) => c.name), ...used('client:')]);
  const supplierNames = uniq([...suppliers.map((s) => s.name), ...used('supplier:')]);
  const mine = (groups) => accounts.filter((a) => groups.includes(a.group)).sort((a, b) => a.name.localeCompare(b.name)).map((a) => ({ id: `acc:${a.id}`, name: a.name }));
  const expenseNames = [...new Set(used('expense:'))].sort();
  const other = [...new Set(all.map((p) => p.account))].filter((id) => ['tds-receivable', 'tds-payable', 'tcs-payable', 'round-off', 'interest', 'advances', 'drawings', 'stock', 'opening-diff', 'suspense'].includes(id) || id.startsWith('cashcat:'));
  return [
    { group: 'Cash and bank', items: [{ id: 'cash', name: 'Cash' }, { id: 'bank', name: 'Bank' }, ...mine(['cc'])] },
    { group: 'Customers', items: clientNames.map((n) => ({ id: `client:${n}`, name: n })) },
    { group: 'Suppliers', items: supplierNames.map((n) => ({ id: `supplier:${n}`, name: n })) },
    { group: 'Items', items: products.filter((p) => p?.kind !== 'service').sort((a, b) => String(a.name).localeCompare(String(b.name))).map((p) => ({ id: `item:${p.id}`, name: p.name })) },
    { group: 'GST', items: [{ id: 'gst:all', name: 'GST (all)' }, { id: 'gst:cgst', name: 'CGST' }, { id: 'gst:sgst', name: 'SGST / UTGST' }, { id: 'gst:igst', name: 'IGST' }, { id: 'gst:cess', name: 'Cess' }] },
    { group: 'Sales, purchases and expenses', items: [{ id: 'sales', name: 'Sales (without GST)' }, { id: 'purchases', name: 'Purchases (without GST)' }, { id: 'expenses', name: 'Expenses (all, without GST)' }, ...expenseNames.map((n) => ({ id: `expense:${n}`, name: `Expense: ${n}` }))] },
    { group: 'Capital and loans', items: mine(['capital', 'secured-loans', 'unsecured-loans', 'current-liabilities']) },
    { group: 'Assets and loans given', items: mine(['fixed-assets', 'investments', 'loans-advances', 'deposits', 'current-assets']) },
    { group: 'Other income and expenses', items: mine(['indirect-incomes', 'indirect-expenses', 'direct-expenses', 'direct-incomes']) },
    { group: 'Other', items: other.map((id) => ({ id, name: accountInfo(id, accounts).name })).sort((a, b) => a.name.localeCompare(b.name)) },
  ].filter((g) => g.items.length);
}

// One ledger by id. Item ledgers come back as { kind: 'item', ... }; the
// others as { kind: 'money', entries } for ledgerView.
export function buildLedger(id, data = {}) {
  const [type, ...rest] = String(id || '').split(':');
  const arg = rest.join(':');
  if (type === 'item') {
    const product = (data.products || []).find((p) => p.id === arg);
    return product ? { kind: 'item', title: product.name, ...itemLedger(product, data) } : null;
  }
  if (type === 'client') return { kind: 'money', title: arg, entries: clientLedger(arg, data) };
  if (type === 'supplier') return { kind: 'money', title: arg, entries: supplierLedger(arg, data) };
  if (type === 'gst') return { kind: 'money', title: arg === 'all' ? 'GST' : arg.toUpperCase(), entries: gstLedger(arg || 'all', data) };
  if (id === 'expenses') return { kind: 'money', title: 'Expenses', entries: expensesLedger(data) };
  const known = SYSTEM[id] || ['acc', 'expense', 'cashcat'].includes(type);
  if (!known) return null;
  const info = accountInfo(id, data.accounts || []);
  return { kind: 'money', title: info.name, account: info.account || null, entries: accountEntries(id, postings(data)) };
}

// ---- final accounts ------------------------------------------------------------
// Stock value (without GST, at average cost) as on a date: '' = before anything.
export function stockValue({ products = [], bills = [], purchases = [] } = {}, onDate) {
  let total = 0;
  const lines = [];
  for (const pr of products) {
    if (pr?.kind === 'service') continue;
    const { rows, unit } = itemLedger(pr, { bills, purchases });
    let last = null;
    for (const r of rows) if (onDate === undefined || String(r.date) <= onDate) last = r;
    if (!last) continue;
    total += last.balanceValue;
    if (Math.abs(last.balanceQty) > 0.0005 || Math.abs(last.balanceValue) > 0.005) lines.push({ id: pr.id, name: pr.name, unit, qty: last.balanceQty, avgCost: last.avgCost, value: last.balanceValue });
  }
  return { total: r2(total), lines };
}
const dayBefore = (d) => {
  if (!d) return '';
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
};

// Balance of every account: { id: { name, group, dr, cr, net } } over postings
// with from <= date <= to ('' = no limit).
function balances(all, accounts, { from = '', to = '' } = {}) {
  const map = new Map();
  for (const p of all) {
    if ((from && p.date < from) || (to && p.date > to)) continue;
    let b = map.get(p.account);
    if (!b) { b = { ...accountInfo(p.account, accounts), dr: 0, cr: 0 }; map.set(p.account, b); }
    b.dr += p.dr; b.cr += p.cr;
  }
  for (const b of map.values()) { b.dr = r2(b.dr); b.cr = r2(b.cr); b.net = r2(b.dr - b.cr); }
  return map;
}

// Trial balance for a period (usually a financial year): balance-sheet
// accounts as on `to`, income and expense accounts for the period only, the
// profit of earlier years in one line, and the opening stock of the period.
// Closing stock is shown below it, as in Tally (it is not a ledger balance).
export function trialBalance(data = {}, { from = '', to = '' } = {}) {
  const accounts = data.accounts || [];
  const all = postings(data);
  const upto = balances(all, accounts, { to });
  const period = balances(all, accounts, { from, to });
  const before = from ? balances(all, accounts, { to: dayBefore(from) }) : new Map();
  const rows = [];
  let earlier = 0;
  const openingStockVal = from ? stockValue(data, dayBefore(from)).total : 0;
  for (const [id, b] of upto) {
    if (b.group === 'stock') continue;
    if (isPnlGroup(b.group)) {
      const p = period.get(id);
      if (p && Math.abs(p.net) >= 0.005) rows.push({ id, name: b.name, group: b.group, net: p.net });
    } else if (Math.abs(b.net) >= 0.005) rows.push({ id, name: b.name, group: b.group, net: b.net });
  }
  for (const [, b] of before) if (isPnlGroup(b.group) || b.group === 'stock') earlier += b.net;
  earlier = r2(earlier - openingStockVal);
  const openingStock = r2(openingStockVal + (period.get('stock')?.net || 0));
  if (Math.abs(openingStock) >= 0.005) rows.push({ id: 'stock', name: 'Opening stock', group: 'stock', net: openingStock });
  if (Math.abs(earlier) >= 0.005) rows.push({ id: 'pl-earlier', name: 'Profit & loss account (earlier years)', group: 'capital', net: earlier });
  const order = Object.keys(ACCOUNT_GROUPS);
  rows.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.name.localeCompare(b.name));
  const dr = r2(rows.reduce((s, r) => s + (r.net > 0 ? r.net : 0), 0));
  const cr = r2(rows.reduce((s, r) => s + (r.net < 0 ? -r.net : 0), 0));
  const closingStock = stockValue(data, to || undefined);
  return { rows, dr, cr, difference: r2(dr - cr), closingStock: closingStock.total, stockLines: closingStock.lines, openingStock, earlierProfit: r2(-earlier) };
}

// Trading and profit & loss account for a period, from the trial balance.
export function profitAndLoss(data = {}, range = {}) {
  const tb = trialBalance(data, range);
  const pick = (groups) => tb.rows.filter((r) => groups.includes(r.group));
  const total = (rows, sign) => r2(rows.reduce((s, r) => s + sign * r.net, 0));
  const sales = pick(['sales']); const directIn = pick(['direct-incomes']);
  const purch = pick(['purchases']); const directEx = pick(['direct-expenses']);
  const indirectIn = pick(['indirect-incomes']); const indirectEx = pick(['indirect-expenses']);
  const grossProfit = r2(total(sales, -1) + total(directIn, -1) + tb.closingStock - tb.openingStock - total(purch, 1) - total(directEx, 1));
  // A Dr balance in an income group is a cost, and a Cr in an expense group income.
  const netProfit = r2(grossProfit + total(indirectIn, -1) - total(indirectEx, 1));
  return {
    openingStock: tb.openingStock, closingStock: tb.closingStock,
    sales, directIncomes: directIn, purchases: purch, directExpenses: directEx, indirectIncomes: indirectIn, indirectExpenses: indirectEx,
    totals: { sales: total(sales, -1), directIncomes: total(directIn, -1), purchases: total(purch, 1), directExpenses: total(directEx, 1), indirectIncomes: total(indirectIn, -1), indirectExpenses: total(indirectEx, 1) },
    grossProfit, netProfit, earlierProfit: tb.earlierProfit, trial: tb,
  };
}

// Balance sheet as on `to`, with the profit of the period from `from`.
// Customers who paid in advance and suppliers you paid in advance move to the
// other side; any group whose total is on the other side moves too.
export function balanceSheet(data = {}, range = {}) {
  const pl = profitAndLoss(data, range);
  const tb = pl.trial;
  const liab = []; const assets = [];
  const add = (side, group, name, amount, id) => {
    const list = side === 'liability' ? liab : assets;
    let g = list.find((x) => x.group === group);
    if (!g) { g = { group, name: ACCOUNT_GROUPS[group]?.name || group, items: [], total: 0 }; list.push(g); }
    g.items.push({ id, name, amount: r2(amount) });
    g.total = r2(g.total + amount);
  };
  for (const r of tb.rows) {
    if (isPnlGroup(r.group) || r.group === 'stock' || r.id === 'pl-earlier') continue;
    if (r.group === 'sundry-debtors' && r.net < 0) { add('liability', 'current-liabilities', `Advance from ${r.name}`, -r.net, r.id); continue; }
    if (r.group === 'sundry-creditors' && r.net > 0) { add('asset', 'loans-advances', `Advance to ${r.name}`, r.net, r.id); continue; }
    const natural = ACCOUNT_GROUPS[r.group]?.side === 'asset' ? 'asset' : 'liability';
    add(natural, r.group, r.name, natural === 'asset' ? r.net : -r.net, r.id);
  }
  if (Math.abs(pl.earlierProfit) >= 0.005) add('liability', 'capital', 'Profit & loss account: earlier years', pl.earlierProfit, 'pl-earlier');
  add('liability', 'capital', 'Profit & loss account: this period', pl.netProfit, 'pl-period');
  if (Math.abs(pl.closingStock) >= 0.005) add('asset', 'current-assets', 'Closing stock', pl.closingStock, 'closing-stock');
  // A group with a negative total belongs on the other side (an overdrawn
  // bank, GST credit carried forward under duties and taxes...).
  const flip = (from, to) => {
    for (const g of [...from]) {
      if (g.total < -0.005) { from.splice(from.indexOf(g), 1); to.push({ ...g, total: -g.total, items: g.items.map((i) => ({ ...i, amount: -i.amount })) }); }
    }
  };
  flip(liab, assets); flip(assets, liab);
  const order = Object.keys(ACCOUNT_GROUPS);
  const sort = (l) => l.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  sort(liab); sort(assets);
  const totalL = r2(liab.reduce((s, g) => s + g.total, 0));
  const totalA = r2(assets.reduce((s, g) => s + g.total, 0));
  return { liabilities: liab, assets, totalLiabilities: totalL, totalAssets: totalA, difference: r2(totalL - totalA), profit: pl };
}

// Accounts a voucher line can use, grouped for a picker.
const COMMON_EXPENSES = ['Interest', 'Depreciation', 'Bank charges', 'Salary', 'Rent', 'Electricity', 'Freight', 'Loading and unloading', 'Repairs', 'Telephone', 'Commission paid', 'Discount allowed'];
export function postableAccounts(data = {}) {
  const { accounts = [], clients = [], suppliers = [], expenses = [] } = data;
  const all = postings(data);
  const uniq = (names) => [...new Map(names.filter(Boolean).map((n) => [partyKey(n), String(n).trim()])).values()].sort((a, b) => a.localeCompare(b));
  const used = (prefix) => all.filter((p) => p.account.startsWith(prefix)).map((p) => p.account.slice(prefix.length));
  const mine = (groups) => accounts.filter((a) => groups.includes(a.group)).sort((a, b) => a.name.localeCompare(b.name)).map((a) => ({ id: `acc:${a.id}`, name: a.name }));
  const sys = (ids) => ids.map((id) => ({ id, name: accountInfo(id, accounts).name }));
  const expenseNames = [...new Set([...COMMON_EXPENSES, ...expenses.map((e) => e.category).filter(Boolean), ...used('expense:')])].sort((a, b) => a.localeCompare(b));
  return [
    { group: 'Cash, bank and CC', items: [...sys(['cash', 'bank']), ...mine(['cc'])] },
    { group: 'Capital and loans taken', items: [...mine(['capital', 'secured-loans', 'unsecured-loans']), ...sys(['drawings'])] },
    { group: 'Assets, loans and deposits given', items: mine(['fixed-assets', 'investments', 'loans-advances', 'deposits', 'current-assets']) },
    { group: 'Other liabilities', items: mine(['current-liabilities']) },
    { group: 'Expenses', items: [...expenseNames.map((n) => ({ id: `expense:${n}`, name: n })), ...mine(['indirect-expenses', 'direct-expenses'])] },
    { group: 'Income', items: [...mine(['indirect-incomes', 'direct-incomes']), ...sys(['sales'])] },
    { group: 'Customers', items: uniq([...clients.map((c) => c.name), ...used('client:')]).map((n) => ({ id: `client:${n}`, name: n })) },
    { group: 'Suppliers', items: uniq([...suppliers.map((s) => s.name), ...used('supplier:')]).map((n) => ({ id: `supplier:${n}`, name: n })) },
    { group: 'GST, TDS and TCS', items: sys(['gst:cgst', 'gst:sgst', 'gst:igst', 'gst:cess', 'tds-payable', 'tds-receivable', 'tcs-payable']) },
    { group: 'Other', items: sys(['purchases', 'advances', 'round-off', 'suspense', 'opening-diff']) },
  ].filter((g) => g.items.length);
}

// Closing balance of every account: { id: net } (Dr positive) up to a date.
export function accountBalances(data = {}, to = '') {
  const map = {};
  for (const p of postings(data)) {
    if (to && p.date > to) continue;
    map[p.account] = r2((map[p.account] || 0) + p.dr - p.cr);
  }
  return map;
}
