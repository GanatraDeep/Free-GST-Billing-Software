// Divtech Hisaab - the year-end pack for the CA: one Excel workbook with the
// trial balance, trading and profit & loss account, balance sheet, day book,
// cash and bank books, every ledger (customers, suppliers, items, accounts),
// debtors and creditors, stock, registers and vouchers. Pure: returns sheets
// for utils/xlsx.js buildWorkbook().
import {
  postings, ledgerView, accountInfo, trialBalance, profitAndLoss, balanceSheet, stockValue, itemLedger,
  ACCOUNT_GROUPS, side, billTaxable, billGst, purchaseGst, isUrdPurchase,
} from './ledgers.js';
import { salesSign } from '../utils.js';
import { VOUCHER_TYPES } from './vouchers.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const drcr = (v) => (Math.abs(v) < 0.005 ? '' : side(v));
const inRange = (d, { from, to }) => (!from || d >= from) && (!to || d <= to);
const groupName = (g) => ACCOUNT_GROUPS[g]?.name || g;

// One ledger as rows, with a title row, opening and closing. `withName` puts
// the account name in the first column (for stacked ledgers).
function ledgerRows(name, entries, range) {
  const v = ledgerView(entries, range);
  if (!v.rows.length && Math.abs(v.opening) < 0.005) return [];
  return [
    [name, '', 'Opening balance', '', '', '', Math.abs(v.opening), drcr(v.opening)],
    ...v.rows.map((r) => [name, r.date, r.particulars, r.ref || '', r.dr || '', r.cr || '', Math.abs(r.balance), drcr(r.balance)]),
    [name, '', 'Closing balance', '', v.totals.dr, v.totals.cr, Math.abs(v.closing), drcr(v.closing)],
    [],
  ];
}
const LEDGER_HEAD = ['Account', 'Date', 'Particulars', 'Ref', 'Debit', 'Credit', 'Balance', 'Dr/Cr'];

export function caPackSheets(data = {}, { from = '', to = '', profile = null, title = '' } = {}) {
  const range = { from, to };
  const accounts = data.accounts || [];
  const all = postings(data);
  const tb = trialBalance(data, range);
  const pl = profitAndLoss(data, range);
  const bs = balanceSheet(data, range);
  const ids = [...new Set(all.map((p) => p.account))];
  const byAccount = (id) => all.filter((p) => p.account === id);
  const named = (id) => accountInfo(id, accounts).name;
  const sortIds = (list) => list.sort((a, b) => named(a).localeCompare(named(b)));
  const sheets = [];

  // Trial balance.
  sheets.push({
    name: 'Trial balance',
    rows: [['Group', 'Account', 'Debit', 'Credit'],
      ...tb.rows.map((r) => [groupName(r.group), r.name, r.net > 0 ? r.net : '', r.net < 0 ? -r.net : '']),
      ['', 'Total', tb.dr, tb.cr],
      [],
      ['', `Closing stock on ${to || 'today'} (not a ledger balance)`, tb.closingStock, '']],
  });

  // Trading and profit & loss account.
  const plRows = [['Particulars', 'Amount', 'Total']];
  const section = (titleText, rows, sign) => {
    plRows.push([titleText, '', '']);
    for (const r of rows) plRows.push([`   ${r.name}`, r2(sign * r.net), '']);
  };
  plRows.push(['TRADING ACCOUNT', '', '']);
  plRows.push(['Opening stock', '', pl.openingStock]);
  section('Purchases', pl.purchases, 1); plRows.push(['Total purchases', '', pl.totals.purchases]);
  if (pl.directExpenses.length) { section('Direct expenses', pl.directExpenses, 1); plRows.push(['Total direct expenses', '', pl.totals.directExpenses]); }
  section('Sales', pl.sales, -1); plRows.push(['Total sales', '', pl.totals.sales]);
  if (pl.directIncomes.length) { section('Direct incomes', pl.directIncomes, -1); plRows.push(['Total direct incomes', '', pl.totals.directIncomes]); }
  plRows.push(['Closing stock', '', pl.closingStock]);
  plRows.push([pl.grossProfit >= 0 ? 'GROSS PROFIT' : 'GROSS LOSS', '', pl.grossProfit]);
  plRows.push([]);
  plRows.push(['PROFIT AND LOSS ACCOUNT', '', '']);
  section('Indirect incomes', pl.indirectIncomes, -1); plRows.push(['Total indirect incomes', '', pl.totals.indirectIncomes]);
  section('Indirect expenses', pl.indirectExpenses, 1); plRows.push(['Total indirect expenses', '', pl.totals.indirectExpenses]);
  plRows.push([pl.netProfit >= 0 ? 'NET PROFIT' : 'NET LOSS', '', pl.netProfit]);
  sheets.push({ name: 'Profit and loss', rows: plRows });

  // Balance sheet.
  const bsRows = [['Particulars', 'Amount', 'Total']];
  const bsSide = (titleText, groups, total) => {
    bsRows.push([titleText, '', '']);
    for (const g of groups) {
      bsRows.push([g.name, '', g.total]);
      for (const i of g.items) bsRows.push([`   ${i.name}`, i.amount, '']);
    }
    bsRows.push([`Total ${titleText.toLowerCase()}`, '', total]);
    bsRows.push([]);
  };
  bsSide('LIABILITIES', bs.liabilities, bs.totalLiabilities);
  bsSide('ASSETS', bs.assets, bs.totalAssets);
  if (Math.abs(bs.difference) >= 0.005) bsRows.push(['Difference (check the trial balance)', '', bs.difference]);
  sheets.push({ name: 'Balance sheet', rows: bsRows });

  // Day book: every posting of the period.
  const docOrder = all.filter((p) => inRange(p.date, range)).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.doc).localeCompare(String(b.doc)));
  sheets.push({ name: 'Day book', rows: [['Date', 'Entry', 'Account', 'Particulars', 'Ref', 'Debit', 'Credit'], ...docOrder.map((p) => [p.date, p.doc, named(p.account), p.particulars, p.ref || '', p.dr || '', p.cr || ''])] });

  // Cash and bank books.
  sheets.push({ name: 'Cash book', rows: [LEDGER_HEAD, ...ledgerRows('Cash', byAccount('cash'), range)] });
  sheets.push({ name: 'Bank book', rows: [LEDGER_HEAD, ...ledgerRows('Bank', byAccount('bank'), range)] });

  // Customer and supplier ledgers, every other ledger.
  const stacked = (filter) => sortIds(ids.filter(filter)).flatMap((id) => ledgerRows(named(id), byAccount(id), range));
  sheets.push({ name: 'Customer ledgers', rows: [LEDGER_HEAD, ...stacked((id) => id.startsWith('client:'))] });
  sheets.push({ name: 'Supplier ledgers', rows: [LEDGER_HEAD, ...stacked((id) => id.startsWith('supplier:'))] });
  sheets.push({ name: 'Other ledgers', rows: [LEDGER_HEAD, ...stacked((id) => !['cash', 'bank'].includes(id) && !id.startsWith('client:') && !id.startsWith('supplier:'))] });

  // Debtors and creditors on the closing date.
  const closingOf = (id) => r2(all.filter((p) => p.account === id && (!to || p.date <= to)).reduce((s, p) => s + p.dr - p.cr, 0));
  const party = (prefix) => sortIds(ids.filter((id) => id.startsWith(prefix))).map((id) => [named(id), closingOf(id)]).filter(([, v]) => Math.abs(v) >= 0.005);
  sheets.push({ name: 'Debtors', rows: [['Customer', 'Balance', 'Dr/Cr'], ...party('client:').map(([n, v]) => [n, Math.abs(v), drcr(v)])] });
  sheets.push({ name: 'Creditors', rows: [['Supplier', 'Balance', 'Dr/Cr'], ...party('supplier:').map(([n, v]) => [n, Math.abs(v), drcr(v)])] });

  // Stock.
  const st = stockValue(data, to || undefined);
  sheets.push({ name: 'Stock summary', rows: [['Item', 'Unit', 'Quantity', 'Average cost', 'Value (without GST)'], ...st.lines.map((l) => [l.name, l.unit, l.qty, l.avgCost, l.value]), ['Total', '', '', '', st.total]] });
  const stockRows = [];
  for (const pr of (data.products || []).filter((p) => p?.kind !== 'service').sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    const L = itemLedger(pr, data);
    const rows = L.rows.filter((r) => r.kind !== 'opening' && inRange(r.date || '', range));
    if (!rows.length) continue;
    for (const r of rows) stockRows.push([pr.name, r.date, r.particulars, r.ref || '', r.qtyIn || '', r.qtyOut || '', r.rate, r.value, r.balanceQty, r.avgCost, r.balanceValue]);
    stockRows.push([]);
  }
  sheets.push({ name: 'Stock register', rows: [['Item', 'Date', 'Particulars', 'Ref', 'In', 'Out', 'Rate', 'Value (no GST)', 'Stock', 'Avg cost', 'Stock value'], ...stockRows] });

  // Registers.
  const bills = (data.bills || []).filter((b) => salesSign(b) !== 0 && inRange(b.invoiceDate || '', range)).sort((a, b) => String(a.invoiceDate).localeCompare(String(b.invoiceDate)));
  sheets.push({ name: 'Sales register', rows: [['Date', 'Number', 'Type', 'Sale type', 'Customer', 'GSTIN', 'Taxable', 'CGST', 'SGST/UTGST', 'IGST', 'Cess', 'Total', 'Status'],
    ...bills.map((b) => { const s = salesSign(b); const g = billGst(b); return [b.invoiceDate, b.invoiceNumber, b.invoiceType || 'tax-invoice', b.data?.details?.saleType?.name || '', b.clientName || '', b.data?.client?.gstin || '', r2(s * billTaxable(b)), r2(s * g.cgst), r2(s * g.sgst), r2(s * g.igst), r2(s * g.cess), r2(s * (Number(b.totalAmount) || 0)), b.status || '']; })] });
  const purchases = (data.purchases || []).filter((p) => (p.kind || 'bill') !== 'po' && inRange(p.date || '', range)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  sheets.push({ name: 'Purchase register', rows: [['Date', 'Supplier', 'GSTIN', 'Bill number', 'Type', 'Taxable', 'CGST', 'SGST', 'IGST', 'Cess', 'Total', 'ITC'],
    ...purchases.map((p) => { const g = purchaseGst(p); return [p.date, p.supplierName || '', p.supplierGstin || '', p.invoiceNumber || '', p.purchaseType?.name || '', g.taxable, g.cgst, g.sgst, g.igst, g.cess, r2(Number(p.totalAmount) || 0), isUrdPurchase(p) ? 'No (URD)' : 'Yes']; })] });
  const expenses = (data.expenses || []).filter((e) => inRange(e.date || '', range)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  sheets.push({ name: 'Expense register', rows: [['Date', 'Category', 'Description', 'Vendor', 'Payment mode', 'Before GST', 'GST', 'Total'],
    ...expenses.map((e) => [e.date, e.category || '', e.description || '', e.vendorName || '', e.paymentMode || '', r2((Number(e.amount) || 0) - (Number(e.gstAmount) || 0)), r2(e.gstAmount), r2(e.amount)])] });
  const receipts = (data.receipts || []).filter((r) => inRange(r.date || '', range)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  sheets.push({ name: 'Receipts', rows: [['Date', 'Receipt no.', 'Customer', 'Against', 'Mode', 'Amount'], ...receipts.map((r) => [r.date, r.receiptNo || '', r.clientName || '', r.againstInvoice || '', r.paymentMode || '', r2(r.amount)])] });
  const vt = Object.fromEntries(VOUCHER_TYPES.map(([id, n]) => [id, n]));
  const vouchers = (data.vouchers || []).filter((v) => inRange(v.date || '', range)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  sheets.push({ name: 'Vouchers', rows: [['Date', 'Number', 'Type', 'Account', 'Debit', 'Credit', 'Narration'],
    ...vouchers.flatMap((v) => (v.lines || []).map((l, i) => [i ? '' : v.date, i ? '' : v.number, i ? '' : vt[v.type] || v.type, named(l.account), l.dr || '', l.cr || '', i ? '' : v.narration || '']))] });

  // Summary first.
  const openingDiff = closingOf('opening-diff');
  const suspense = closingOf('suspense');
  const negative = st.lines.filter((l) => l.qty < -0.0005).length;
  const summary = [
    [title || 'Accounts', ''],
    ['Business', profile?.businessName || ''], ['GSTIN', profile?.gstin || ''], ['Period', `${from || 'start'} to ${to || 'today'}`],
    ['Made on', new Date().toLocaleString('en-IN')], [],
    ['Net profit for the period', pl.netProfit], ['Gross profit', pl.grossProfit], ['Closing stock', pl.closingStock],
    ['Balance sheet total', bs.totalAssets], [],
    ['Checks', ''],
    ['Trial balance agrees', Math.abs(tb.difference) < 0.005 ? 'Yes' : `No: off by ${tb.difference}`],
    ['Difference in opening balances', Math.abs(openingDiff) < 0.005 ? 'Nil' : `${Math.abs(openingDiff)} ${drcr(openingDiff)} (set the capital account's opening balance)`],
    ['Suspense (payments in other modes, marked paid)', Math.abs(suspense) < 0.005 ? 'Nil' : `${Math.abs(suspense)} ${drcr(suspense)}`],
    ['Items with negative stock', negative || 'None'], [],
    ['Sheet', 'Rows'],
    ...sheets.map((s) => [s.name, Math.max(0, s.rows.length - 1)]),
  ];
  return [{ name: 'Summary', rows: summary }, ...sheets];
}
