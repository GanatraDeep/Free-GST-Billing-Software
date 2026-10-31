// Divtech Hisaab - ledger checks (node scripts/ledger-test.mjs).
import {
  ledgerView, clientLedger, supplierLedger, gstLedger, salesLedger, purchasesLedger, moneyLedger,
  itemLedger, costOfGoodsSold, buildLedger, ledgerCatalog, side, isUrdPurchase,
  postings, trialBalance, profitAndLoss, balanceSheet, stockValue,
} from '../src/utils/ledgers.js';
import { sheetNames, buildWorkbook } from '../src/utils/xlsx.js';
import { caPackSheets } from '../src/utils/caPack.js';
import { voucherProblem, nextVoucherNumber, depreciation, accountProblem } from '../src/utils/vouchers.js';
import { unzipSync, strFromU8 } from 'fflate';
import { typesList, typeProblem, defaultType, needsReceipt, typeRef, cleanType } from '../src/utils/docTypes.js';

let passed = 0, failed = 0;
const eq = (a, b, msg) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) { passed += 1; console.log(`  ✓ ${msg}`); } else { failed += 1; console.log(`  ✗ ${msg}\n     expected: ${JSON.stringify(b)}\n     actual:   ${JSON.stringify(a)}`); }
};

// An oil trader: buys 10 tins at 2,000 + 5% GST, sells 2 for cash and 1 on credit.
const oil = { id: 'p1', name: 'Groundnut oil 15 kg tin', unit: 'Tin', purchasePrice: 2000, stock: 7.5 };
const purchases = [
  { id: 'pu1', kind: 'bill', date: '2026-11-01', supplierName: 'Saurashtra Oil Mills', invoiceNumber: 'SOM/101', interstate: false,
    purchaseType: { id: 'debit', name: 'Debit', payment: 'credit' },
    items: [{ name: 'Groundnut oil 15 kg tin', productId: 'p1', quantity: 10, rate: 2000, taxPercent: 5 }],
    payments: [{ id: 'x1', date: '2026-11-05', amount: 10000, mode: 'bank-transfer' }] },
  { id: 'pu2', kind: 'bill', date: '2026-11-02', supplierName: 'Village farmer', invoiceNumber: 'URD-1', interstate: false,
    purchaseType: { id: 'urd', name: 'URD', payment: 'cash', urd: true },
    items: [{ name: 'Loose oil', quantity: 1, rate: 500, taxPercent: 5 }],
    payments: [{ id: 'x2', date: '2026-11-02', amount: 525, mode: 'cash' }] },
  { id: 'po1', kind: 'po', date: '2026-11-01', supplierName: 'Saurashtra Oil Mills', items: [{ name: 'x', quantity: 99, rate: 1 }] },
];
const sale = (id, date, client, qty, rate, extra = {}) => {
  const taxable = qty * rate, tax = taxable * 0.05;
  return {
    id, invoiceNumber: id, invoiceType: 'tax-invoice', invoiceDate: date, clientName: client, status: 'unpaid',
    totalAmount: taxable + tax, totalTaxAmount: tax,
    data: { items: [{ name: 'Groundnut oil 15 kg tin', productId: 'p1', quantity: qty, rate, taxPercent: 5 }],
      totals: { taxableAmount: taxable, cgst: tax / 2, sgst: tax / 2, igst: 0, cess: 0, isInterstate: false, total: taxable + tax } },
    ...extra,
  };
};
const bills = [
  sale('A/1', '2026-11-03', 'Patel Kirana', 2, 2400, { status: 'paid', payments: [{ id: 'c1', date: '2026-11-03', amount: 5040, mode: 'cash', auto: true }], data: undefined }),
  sale('BB1', '2026-11-04', 'Shree Ram Traders', 1, 2500),
  { ...sale('CN1', '2026-11-06', 'Shree Ram Traders', 0.5, 2500), invoiceType: 'credit-note' },
  { ...sale('Q1', '2026-11-06', 'Patel Kirana', 5, 2400), invoiceType: 'quotation' },
];
bills[0].data = sale('x', '', '', 2, 2400).data;
bills[0].data.details = { saleType: { name: 'Cash' } };
const receipts = [{ id: 'r1', receiptNo: 'RCP/1', date: '2026-11-07', clientName: 'Shree Ram Traders', amount: 1312.5, paymentMode: 'UPI', againstInvoice: 'BB1' }];
bills[1].payments = [{ id: 'r1', date: '2026-11-07', amount: 1312.5, mode: 'upi', receiptNo: 'RCP/1' }];
const openings = [{ id: 'o1', party: 'supplier', name: 'Saurashtra Oil Mills', amount: 50000, direction: 'owed', asOn: '2026-10-31', payments: [] }];
const cashEntries = [{ id: 'e1', type: 'out', book: 'cash', date: '2026-11-08', amount: 3000, category: 'Deposit to bank', name: 'SBI' }];
const data = { bills, purchases, receipts, openings, cashEntries, products: [oil], expenses: [] };

console.log('\n[Ledgers] running balance');
const v = ledgerView([{ date: '2026-01-01', dr: 100, cr: 0 }, { date: '2026-02-01', dr: 0, cr: 30 }, { date: '2026-03-01', dr: 5, cr: 0 }], { from: '2026-02-01' });
eq([v.opening, v.rows.map((r) => r.balance), v.closing], [100, [70, 75], 75], 'Opening brought forward, running balance, closing');
eq([side(5), side(-5), side(0)], ['Dr', 'Cr', ''], 'Dr / Cr sides');

console.log('\n[Ledgers] customer');
const patel = ledgerView(clientLedger('patel kirana', data));
eq([patel.totals.dr, patel.totals.cr, patel.closing], [5040, 5040, 0], 'Cash sale: billed and received at once, nothing due');
eq(patel.rows[0].particulars, 'Sale (Cash)', 'The sale type shows on the line');
const shree = ledgerView(clientLedger('Shree Ram Traders', data));
eq([shree.totals.dr, shree.totals.cr, shree.closing], [2625, 2625, 0], 'Debit sale 2,625 less credit note 1,312.50 less UPI receipt 1,312.50 = nil');
eq(shree.rows.filter((r) => /Receipt/.test(r.particulars)).length, 1, 'A receipt linked to the invoice is counted once');

console.log('\n[Ledgers] supplier');
const som = ledgerView(supplierLedger('Saurashtra Oil Mills', data));
eq([som.totals.cr, som.totals.dr, som.closing], [71000, 10000, -61000], 'Opening 50,000 + purchase 21,000 - paid 10,000 = 61,000 Cr; purchase order left out');
eq(side(som.closing), 'Cr', 'Owed to the supplier is Cr');

console.log('\n[Ledgers] GST');
const gst = ledgerView(gstLedger('all', data));
eq([gst.totals.cr, gst.totals.dr], [365, 1062.5], 'Output 240 + 125 on sales; input 1,000 on the purchase + 62.50 reversed by the credit note');
eq(gst.rows.some((r) => r.ref === 'URD-1'), false, 'URD purchase gives no input tax credit');
eq(isUrdPurchase(purchases[1]), true, 'URD purchase recognised');
eq(ledgerView(gstLedger('cgst', data)).closing, ledgerView(gstLedger('sgst', data)).closing, 'CGST and SGST ledgers match on intra-state trade');
eq(ledgerView(gstLedger('igst', data)).rows.length, 0, 'No IGST lines on intra-state trade');

console.log('\n[Ledgers] sales and purchases without GST');
eq(ledgerView(salesLedger(data)).closing, -6050, 'Sales 4,800 + 2,500 - credit note 1,250 = 6,050 Cr; quotation left out');
eq(ledgerView(purchasesLedger(data)).closing, 20525, 'Purchases 20,000 + URD 500 with its 25 GST (not claimed, so it is cost) = 20,525 Dr');

console.log('\n[Ledgers] cash and bank');
const cash = ledgerView(moneyLedger('cash', data));
eq([cash.totals.dr, cash.totals.cr, cash.closing], [5040, 3525, 1515], 'Cash: cash sale in, URD purchase and bank deposit out');
const bank = ledgerView(moneyLedger('bank', data));
eq([bank.totals.dr, bank.totals.cr, bank.closing], [4312.5, 10000, -5687.5], 'Bank: UPI receipt and cash deposit in, supplier payment out');

console.log('\n[Ledgers] item');
const item = itemLedger(oil, data);
eq(item.rows.map((r) => [r.kind, r.qtyIn, r.qtyOut, r.balanceQty]), [['opening', 0, 0, 0], ['purchase', 10, 0, 10], ['sale', 0, 2, 8], ['sale', 0, 1, 7], ['return', 0.5, 0, 7.5]], 'Opening, purchase in, sales out, return in');
eq(item.closingQty, 7.5, 'Closing quantity');
eq(item.rows[2].value, 4800, 'Sale value without GST');
eq([item.avgCost, item.closingValue], [2000, 15000], 'Average cost and stock value without GST');
eq(itemLedger({ ...oil, stock: 10.5 }, data).rows[0].qtyIn, 3, 'Stock entered before the first purchase becomes the opening stock');
{
  // A sale typed by name (not picked from Products) does not move Products' stock.
  const typed = { bills: [{ ...sale('T1', '2026-11-03', 'Walk-in', 2, 2400), data: { ...sale('T1', '', '', 2, 2400).data, items: [{ name: 'groundnut oil 15 KG tin', quantity: 2, rate: 2400, taxPercent: 5 }] } }], purchases: [purchases[0]] };
  const L = itemLedger({ ...oil, stock: 10 }, typed);
  eq([L.rows[0].qtyIn, L.closingQty, !!L.rows[2].unlinked], [0, 8, true], 'A sale typed by name is in the ledger, flagged, and not mistaken for opening stock');
}

console.log('\n[Ledgers] cost of goods sold (the margin)');
const cogs = costOfGoodsSold(data, { from: '2026-11-01', to: '2026-11-30' });
eq(cogs, { cost: 5000, noCost: 0, byMonth: { '2026-11': 5000 } }, '3 tins sold at 2,000 cost, half a tin returned: 5,000');
eq(costOfGoodsSold({ ...data, products: [{ ...oil, purchasePrice: 0 }], purchases: [] }).noCost, 3, 'Sales of an item with no cost are counted, not guessed');
eq(costOfGoodsSold(data, { from: '2026-12-01' }).cost, 0, 'Outside the period: nothing');

console.log('\n[Ledgers] picking a ledger');
const cat = ledgerCatalog({ clients: [{ name: 'Patel Kirana' }], products: [oil], bills, purchases, openings });
eq(cat.find((g) => g.group === 'Suppliers').items.map((i) => i.name), ['Saurashtra Oil Mills', 'Village farmer'], 'Suppliers from purchases and opening balances, once each');
eq(cat.find((g) => g.group === 'Customers').items.map((i) => i.name), ['Patel Kirana', 'Shree Ram Traders'], 'Customers from clients and invoices');
eq(buildLedger('item:p1', data).kind, 'item', 'Item ledger by id');
eq(buildLedger('client:Patel Kirana', data).entries.length, 2, 'Customer ledger by id');
eq(buildLedger('nonsense', data), null, 'Unknown id: none');

console.log('\n[Double entry and final accounts]');
const books = {
  ...data,
  accounts: [
    { id: 'cap', name: 'Ramesh Ganatra capital', group: 'capital', opening: 100000, openingSide: 'Cr', asOn: '2026-10-31' },
    { id: 'cc', name: 'SBI CC account', group: 'cc', opening: 200000, openingSide: 'Cr', asOn: '2026-10-31', limit: 500000 },
    { id: 'shop', name: 'Shop furniture', group: 'fixed-assets', opening: 50000, openingSide: 'Dr', asOn: '2026-10-31' },
    { id: 'loan', name: 'Loan to Suresh', group: 'loans-advances', opening: 0, openingSide: 'Dr' },
  ],
  vouchers: [
    { id: 'v1', type: 'journal', date: '2026-11-30', number: 'JV/1', narration: 'CC interest for November', lines: [{ account: 'expense:Interest', dr: 1500, cr: 0 }, { account: 'acc:cc', dr: 0, cr: 1500 }] },
    { id: 'v2', type: 'payment', date: '2026-11-10', number: 'PV/1', narration: 'Loan given', lines: [{ account: 'acc:loan', dr: 5000, cr: 0 }, { account: 'bank', dr: 0, cr: 5000 }] },
  ],
  expenses: [{ id: 'x1', date: '2026-11-15', category: 'Rent', amount: 1180, gstAmount: 180, paymentMode: 'cash' }],
  cashEntries: [...data.cashEntries, { id: 'e2', type: 'out', date: '2026-11-20', amount: 700, category: 'Owner drawing' }, { id: 'e3', type: 'in', date: '2026-10-31', amount: 20000, category: 'Opening balance' }],
};
{
  const all = postings(books);
  const byDoc = {};
  for (const p of all) byDoc[p.doc] = Math.round(((byDoc[p.doc] || 0) + p.dr - p.cr) * 100) / 100;
  eq(Object.entries(byDoc).filter(([, v]) => Math.abs(v) > 0.005), [], 'Every document posts as much debit as credit');
  const tb = trialBalance(books, { from: '2026-04-01', to: '2027-03-31' });
  eq([tb.difference, tb.dr > 0], [0, true], 'Trial balance agrees');
  eq(tb.closingStock, 15000, 'Closing stock 7.5 tins at 2,000');
  const pl = profitAndLoss(books, { from: '2026-04-01', to: '2027-03-31' });
  eq(pl.grossProfit, 525, 'Gross profit: sales 6,050 + closing stock 15,000 - purchases 20,525');
  eq(pl.netProfit, 525 - 1500 - 1000, 'Net profit: less CC interest 1,500 and rent 1,000 (its GST is credit)');
  const bs = balanceSheet(books, { from: '2026-04-01', to: '2027-03-31' });
  eq(bs.difference, 0, 'Balance sheet agrees');
  const ccLine = bs.liabilities.find((g) => g.group === 'cc');
  eq(ccLine?.total, 201500, 'CC account: 2,00,000 drawn + 1,500 interest');
  eq(bs.assets.find((g) => g.group === 'loans-advances')?.items.find((i) => i.id === 'acc:loan')?.amount, 5000, 'Loan given shows as an asset');
  const half = trialBalance(books, { from: '2026-11-16', to: '2027-03-31' });
  eq(half.difference, 0, 'A trial balance from mid-year agrees too (earlier profit carried in one line)');
  eq(balanceSheet(books, { from: '2026-11-16', to: '2027-03-31' }).totalAssets, bs.totalAssets, 'The balance sheet on a date does not depend on where the period starts');
  eq(buildLedger('acc:cc', books).entries.length, 2, 'CC ledger: opening and interest');
  eq(stockValue(books, '2026-11-02').total, 20000, 'Stock on 2 Nov: the 10 tins bought');
}

console.log('\n[CA pack and vouchers]');
{
  const pack = caPackSheets(books, { from: '2026-04-01', to: '2027-03-31', title: 'FY 2026-27' });
  const names = pack.map((p) => p.name);
  eq(names.slice(0, 4), ['Summary', 'Trial balance', 'Profit and loss', 'Balance sheet'], 'CA pack starts with the summary and the three statements');
  eq(['Day book', 'Cash book', 'Bank book', 'Customer ledgers', 'Supplier ledgers', 'Other ledgers', 'Debtors', 'Creditors', 'Stock summary', 'Stock register', 'Sales register', 'Purchase register', 'Expense register', 'Receipts', 'Vouchers'].every((n) => names.includes(n)), true, 'and has every book, ledger and register');
  eq(pack[0].rows.find((r) => r[0] === 'Trial balance agrees')[1], 'Yes', 'The summary says the trial balance agrees');
  const file = buildWorkbook(pack);
  eq(file.length > 1000, true, 'It builds into one Excel file');
  eq(voucherProblem({ type: 'journal', date: '2026-11-01', lines: [{ account: 'cash', dr: 10 }, { account: 'bank', cr: 9 }] }).startsWith('Debits'), true, 'An unbalanced journal is refused');
  eq(voucherProblem({ type: 'payment', date: '2026-11-01', lines: [{ account: 'acc:x', dr: 10 }, { account: 'cash', cr: 10 }] }), '', 'A balanced payment is fine');
  eq(nextVoucherNumber([{ number: 'JV/26-27/0007' }, { number: 'PV/26-27/0009' }], 'journal', '2026-27'), 'JV/26-27/0008', 'Voucher numbers run per type and year');
  eq(depreciation({ openingWdv: 50000, additions: [{ date: '2026-12-01', amount: 20000 }], rate: 10, fyEnd: '2027-03-31' }), 6000, 'Depreciation: 10% on 50,000 + half rate on an addition used under 180 days');
  eq(accountProblem({ name: 'CC', group: 'cc', opening: 100, asOn: '' }), 'Enter the date of the opening balance.', 'An opening balance needs its date');
}

console.log('\n[Sale and purchase types]');
const st = typesList(null, 'sale');
eq(st.map((t) => [t.name, t.payment]), [['Cash', 'cash'], ['Retail Debit', 'credit'], ['Debit', 'credit']], 'Sales start with Cash, Retail Debit, Debit');
eq(typesList([], 'purchase').map((t) => [t.name, t.payment, t.urd]), [['Cash', 'cash', false], ['Debit', 'credit', false], ['URD', 'credit', true]], 'Purchases start with Cash, Debit, URD (no ITC)');
eq(typesList([{ id: 'x', name: ' Udhar ', payment: 'credit' }, { name: '' }], 'sale').map((t) => t.name), ['Udhar'], 'A saved list replaces the defaults; nameless types are dropped');
eq(typeProblem({ id: 'b', name: 'cash' }, st), 'There is already a type called cash.', 'Two types cannot share a name');
eq(defaultType(st), null, 'No default until one is starred: the form asks');
eq(needsReceipt({ data: { details: { saleType: typeRef(st[2]) } } }), true, 'A Debit invoice is settled by a receipt');
eq(needsReceipt({ data: { details: { saleType: typeRef(st[0]) } } }), false, 'A Cash invoice is not');
eq(needsReceipt({ data: { details: {} } }), false, 'Older invoices without a type work as before');
eq(cleanType({ name: 'X', payment: 'weird' }, 'purchase').payment, 'credit', 'Unknown payment means credit');

console.log('\n[Excel workbook]');
eq(sheetNames(['B2B (4A)', 'a/b', 'X'.repeat(40), 'X'.repeat(40)]), ['B2B (4A)', 'a b', 'X'.repeat(31), `${'X'.repeat(29)} 2`], 'Sheet names: no / : * ? [ ], at most 31 letters, never twice');
{
  const files = unzipSync(buildWorkbook([{ name: 'One', rows: [['A'], [1]] }, { name: 'Two', rows: [['B'], ['x']] }]));
  eq(Object.keys(files).filter((k) => k.startsWith('xl/worksheets/')).length, 2, 'One sheet file per sheet');
  eq((strFromU8(files['xl/workbook.xml']).match(/<sheet /g) || []).length, 2, 'Both sheets listed in the workbook');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
