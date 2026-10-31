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
import { purchaseOwed, hasPurchasePayments, purchaseStatus } from './purchasePayments.js';
import { partyKey, OPENING_REF } from './openingBalances.js';
import { unpairedBillPayments, linkedMoneyLines, ownCashLines, contraLines, bookOfEntry } from './cashBook.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const r3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
const inr = (b) => (b?.currency || b?.data?.invoiceOptions?.currency || 'INR') === 'INR';
const isBill = (p) => (p?.kind || 'bill') !== 'po';
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

// ---- party ledgers --------------------------------------------------------------
export function clientLedger(name, { bills = [], receipts = [], openings = [] } = {}) {
  const key = partyKey(name);
  const mine = (n) => partyKey(n) === key;
  const out = [];
  for (const o of openings) {
    if (o.party !== 'client' || !mine(o.name)) continue;
    out.push({ key: `ob:${o.id}`, date: o.asOn, particulars: o.direction === 'advance' ? 'Opening balance (advance)' : 'Opening balance', ref: '', dr: o.direction === 'owed' ? o.amount : 0, cr: o.direction === 'advance' ? o.amount : 0, view: 'clients' });
    for (const x of o.payments || []) {
      if (x.receiptNo) continue; // the receipt is listed below
      out.push({ key: `obp:${o.id}:${x.id}`, date: x.date, particulars: `Received against opening balance (${x.mode || 'payment'})`, ref: x.note || '', dr: 0, cr: x.amount, view: 'clients' });
    }
  }
  const theirs = bills.filter((b) => inr(b) && salesSign(b) !== 0 && mine(b.clientName || b.data?.client?.name));
  for (const b of theirs) {
    const sign = salesSign(b);
    const total = Number(b.totalAmount) || 0;
    const type = docLabel[b.invoiceType || 'tax-invoice'] || 'Sale';
    const saleType = b.data?.details?.saleType?.name;
    out.push({ key: `bill:${b.id}`, date: b.invoiceDate, particulars: saleType && sign > 0 ? `${type} (${saleType})` : type, ref: b.invoiceNumber, dr: sign > 0 ? total : 0, cr: sign < 0 ? total : 0, view: 'dashboard' });
    const tds = sign > 0 ? r2(total - amountDue(b)) : 0;
    if (tds > 0.005) out.push({ key: `tds:${b.id}`, date: b.invoiceDate, particulars: 'TDS deducted by the customer', ref: b.invoiceNumber, dr: 0, cr: tds, view: 'dashboard' });
  }
  for (const [b, p] of unpairedBillPayments({ bills: theirs, receipts })) {
    if (!(Number(p.amount) > 0)) continue;
    const refund = salesSign(b) < 0;
    out.push({ key: `pay:${b.id}:${p.id || p.date}`, date: p.date || b.invoiceDate, particulars: `${refund ? 'Refund paid' : 'Received'} (${p.mode || 'payment'})`, ref: b.invoiceNumber, dr: refund ? p.amount : 0, cr: refund ? 0 : p.amount, view: 'dashboard' });
  }
  // A bill marked Paid before payments were recorded one by one.
  for (const b of theirs) {
    if (salesSign(b) > 0 && b.status === 'paid' && !(b.payments || []).length && !receipts.some((r) => r.againstInvoice === b.invoiceNumber)) {
      out.push({ key: `markpaid:${b.id}`, date: b.invoiceDate, particulars: 'Marked paid', ref: b.invoiceNumber, dr: 0, cr: amountDue(b), view: 'dashboard' });
    }
  }
  for (const r of receipts) {
    if (!mine(r.clientName) || (r.currency && r.currency !== 'INR') || !(Number(r.amount) > 0)) continue;
    const onOpening = String(r.againstInvoice || '').trim().toLowerCase() === OPENING_REF.toLowerCase();
    out.push({ key: `rcp:${r.id}`, date: r.date, particulars: `Receipt (${r.paymentMode || 'payment'})${onOpening ? ' against opening balance' : ''}`, ref: [r.receiptNo, onOpening ? '' : r.againstInvoice].filter(Boolean).join(' · '), dr: 0, cr: r.amount, view: 'receipts' });
  }
  return out;
}

export function supplierLedger(name, { purchases = [], openings = [] } = {}) {
  const key = partyKey(name);
  const mine = (n) => partyKey(n) === key;
  const out = [];
  for (const o of openings) {
    if (o.party !== 'supplier' || !mine(o.name)) continue;
    out.push({ key: `ob:${o.id}`, date: o.asOn, particulars: o.direction === 'advance' ? 'Opening balance (advance paid)' : 'Opening balance', ref: '', dr: o.direction === 'advance' ? o.amount : 0, cr: o.direction === 'owed' ? o.amount : 0, view: 'purchases' });
    for (const x of o.payments || []) out.push({ key: `obp:${o.id}:${x.id}`, date: x.date, particulars: `Paid against opening balance (${x.mode || 'payment'})`, ref: x.note || '', dr: x.amount, cr: 0, view: 'purchases' });
  }
  for (const p of purchases) {
    if (!isBill(p) || !mine(p.supplierName)) continue;
    const total = purchaseOwed(p) + (Number(p.tdsAmount) || 0);
    const type = p.purchaseType?.name ? `Purchase (${p.purchaseType.name})` : 'Purchase';
    out.push({ key: `pur:${p.id}`, date: p.date, particulars: type, ref: p.invoiceNumber, dr: 0, cr: r2(total), view: 'purchases' });
    if (Number(p.tdsAmount) > 0) out.push({ key: `ptds:${p.id}`, date: p.date, particulars: 'TDS deducted by you', ref: p.invoiceNumber, dr: r2(p.tdsAmount), cr: 0, view: 'purchases' });
    if (hasPurchasePayments(p)) {
      for (const x of p.payments) out.push({ key: `ppay:${p.id}:${x.id}`, date: x.date || p.date, particulars: `Paid (${x.mode || 'payment'})`, ref: [p.invoiceNumber, x.reference].filter(Boolean).join(' · '), dr: x.amount, cr: 0, view: 'purchases' });
    } else if (purchaseStatus(p) === 'Paid') {
      out.push({ key: `pmark:${p.id}`, date: p.date, particulars: 'Marked paid', ref: p.invoiceNumber, dr: purchaseOwed(p), cr: 0, view: 'purchases' });
    }
  }
  return out;
}

// ---- GST ledger -------------------------------------------------------------
const HEADS = ['cgst', 'sgst', 'igst', 'cess'];
export function gstLedger(head = 'all', { bills = [], purchases = [], expenses = [] } = {}) {
  const pick = (g) => (head === 'all' ? HEADS.reduce((s, h) => s + (g[h] || 0), 0) : (g[head] || 0));
  const out = [];
  for (const b of bills) {
    const sign = salesSign(b);
    if (!sign || !inr(b)) continue;
    const amt = r2(pick(billGst(b)));
    if (amt < 0.005) continue;
    out.push({ key: `bill:${b.id}`, date: b.invoiceDate, particulars: `${sign > 0 ? 'Output tax on sale' : 'Output tax reversed (credit note)'} - ${b.clientName || ''}`.trim(), ref: b.invoiceNumber, dr: sign < 0 ? amt : 0, cr: sign > 0 ? amt : 0, view: 'dashboard' });
  }
  for (const p of purchases) {
    if (!isBill(p) || isUrdPurchase(p)) continue;
    const amt = r2(pick(purchaseGst(p)));
    if (amt < 0.005) continue;
    out.push({ key: `pur:${p.id}`, date: p.date, particulars: `Input tax on purchase - ${p.supplierName || ''}`, ref: p.invoiceNumber, dr: amt, cr: 0, view: 'purchases' });
  }
  for (const e of expenses) {
    const g = Number(e.gstAmount) || 0;
    if (g < 0.005 || (e.currency && e.currency !== 'INR')) continue;
    const half = r2(g / 2);
    const split = e.interstate ? { igst: g, cgst: 0, sgst: 0, cess: 0 } : { cgst: half, sgst: r2(g - half), igst: 0, cess: 0 };
    const amt = r2(pick(split));
    if (amt < 0.005) continue;
    out.push({ key: `exp:${e.id}`, date: e.date, particulars: `Input tax on expense - ${e.vendorName || e.category || ''}`, ref: e.invoiceNumber || '', dr: amt, cr: 0, view: 'expenses' });
  }
  return out;
}

// ---- sales / purchases / expenses (value without GST) -----------------------
export function salesLedger({ bills = [] } = {}) {
  return bills.filter((b) => inr(b) && salesSign(b) !== 0).map((b) => {
    const sign = salesSign(b);
    const v = billTaxable(b);
    return { key: `bill:${b.id}`, date: b.invoiceDate, particulars: `${sign > 0 ? 'Sale' : 'Credit note'} - ${b.clientName || ''}`, ref: b.invoiceNumber, dr: sign < 0 ? v : 0, cr: sign > 0 ? v : 0, view: 'dashboard' };
  });
}
export function purchasesLedger({ purchases = [] } = {}) {
  return purchases.filter(isBill).map((p) => ({ key: `pur:${p.id}`, date: p.date, particulars: `Purchase - ${p.supplierName || ''}`, ref: p.invoiceNumber, dr: purchaseGst(p).taxable, cr: 0, view: 'purchases' }));
}
export function expensesLedger({ expenses = [] } = {}) {
  return expenses.filter((e) => !e.currency || e.currency === 'INR').map((e) => ({
    key: `exp:${e.id}`, date: e.date, particulars: [e.category, e.vendorName || e.description].filter(Boolean).join(' - ') || 'Expense',
    ref: e.invoiceNumber || '', dr: r2((Number(e.amount) || 0) - (Number(e.gstAmount) || 0)), cr: 0, view: 'expenses',
  }));
}

// ---- cash and bank ----------------------------------------------------------
export function moneyLedger(book, { bills = [], receipts = [], expenses = [], purchases = [], openings = [], cashEntries = [] } = {}) {
  const own = cashEntries.filter((e) => bookOfEntry(e) === book);
  const lines = [
    ...ownCashLines(own),
    ...contraLines(cashEntries, book),
    ...linkedMoneyLines({ bills: bills.filter(inr), receipts, expenses, purchases: purchases.filter(isBill), openings }, book),
  ];
  return lines.map((l) => ({
    key: l.key, date: l.date, particulars: [l.label || l.category || (l.type === 'in' ? 'Money in' : 'Money out'), l.name].filter(Boolean).join(' - '),
    ref: l.note || '', dr: l.type === 'in' ? l.amount : 0, cr: l.type === 'out' ? l.amount : 0, view: l.view || (book === 'bank' ? 'bankbook' : 'cashbook'),
  }));
}

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
      moves.push({ key: `pur:${p.id}:${i}`, date: p.date, kind: 'purchase', particulars: `Purchase - ${p.supplierName || ''}`, ref: p.invoiceNumber, qtyIn: qty, qtyOut: 0, rate: r2(it.rate), view: 'purchases' });
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
      moves.push({ key: `bill:${b.id}:${i}`, date: b.invoiceDate, kind, particulars: `${label} - ${b.clientName || ''}`, ref: b.invoiceNumber, qtyIn: sign > 0 ? qty : 0, qtyOut: sign < 0 ? qty : 0, rate: r2(qty ? value / qty : 0), saleValue: value, view: 'dashboard', billId: b.id, inr: inr(b) });
    }
  }
  moves.sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.qtyIn ? -1 : 1));
  const net = moves.reduce((s, m) => s + m.qtyIn - m.qtyOut, 0);
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
export function ledgerCatalog({ clients = [], suppliers = [], products = [], bills = [], purchases = [], openings = [] } = {}) {
  const uniq = (names) => [...new Map(names.filter(Boolean).map((n) => [partyKey(n), String(n).trim()])).values()].sort((a, b) => a.localeCompare(b));
  const clientNames = uniq([...clients.map((c) => c.name), ...bills.filter((b) => salesSign(b) !== 0).map((b) => b.clientName), ...openings.filter((o) => o.party === 'client').map((o) => o.name)]);
  const supplierNames = uniq([...suppliers.map((s) => s.name), ...purchases.filter(isBill).map((p) => p.supplierName), ...openings.filter((o) => o.party === 'supplier').map((o) => o.name)]);
  return [
    { group: 'Cash and bank', items: [{ id: 'cash', name: 'Cash' }, { id: 'bank', name: 'Bank' }] },
    { group: 'Customers', items: clientNames.map((n) => ({ id: `client:${n}`, name: n })) },
    { group: 'Suppliers', items: supplierNames.map((n) => ({ id: `supplier:${n}`, name: n })) },
    { group: 'Items', items: products.filter((p) => p?.kind !== 'service').sort((a, b) => String(a.name).localeCompare(String(b.name))).map((p) => ({ id: `item:${p.id}`, name: p.name })) },
    { group: 'GST', items: [{ id: 'gst:all', name: 'GST (all)' }, { id: 'gst:cgst', name: 'CGST' }, { id: 'gst:sgst', name: 'SGST / UTGST' }, { id: 'gst:igst', name: 'IGST' }, { id: 'gst:cess', name: 'Cess' }] },
    { group: 'Sales, purchases and expenses', items: [{ id: 'sales', name: 'Sales (without GST)' }, { id: 'purchases', name: 'Purchases (without GST)' }, { id: 'expenses', name: 'Expenses (without GST)' }] },
  ];
}

// One ledger by id. Item ledgers come back as { kind: 'item', ... }; the
// others as { kind: 'money', entries } for ledgerView.
export function buildLedger(id, data = {}) {
  const [type, ...rest] = String(id || '').split(':');
  const arg = rest.join(':');
  switch (type) {
    case 'client': return { kind: 'money', title: arg, entries: clientLedger(arg, data) };
    case 'supplier': return { kind: 'money', title: arg, entries: supplierLedger(arg, data) };
    case 'gst': return { kind: 'money', title: arg === 'all' ? 'GST' : arg.toUpperCase(), entries: gstLedger(arg || 'all', data) };
    case 'cash': return { kind: 'money', title: 'Cash', entries: moneyLedger('cash', data) };
    case 'bank': return { kind: 'money', title: 'Bank', entries: moneyLedger('bank', data) };
    case 'sales': return { kind: 'money', title: 'Sales', entries: salesLedger(data) };
    case 'purchases': return { kind: 'money', title: 'Purchases', entries: purchasesLedger(data) };
    case 'expenses': return { kind: 'money', title: 'Expenses', entries: expensesLedger(data) };
    case 'item': {
      const product = (data.products || []).find((p) => p.id === arg);
      return product ? { kind: 'item', title: product.name, ...itemLedger(product, data) } : null;
    }
    default: return null;
  }
}
