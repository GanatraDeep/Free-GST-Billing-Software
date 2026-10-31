// Divtech Hisaab - ledger checks (node scripts/ledger-test.mjs).
import {
  ledgerView, clientLedger, supplierLedger, gstLedger, salesLedger, purchasesLedger, moneyLedger,
  itemLedger, costOfGoodsSold, buildLedger, ledgerCatalog, side, isUrdPurchase,
} from '../src/utils/ledgers.js';
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
eq(ledgerView(purchasesLedger(data)).closing, 20500, 'Purchases 20,000 + URD 500 = 20,500 Dr');

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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
