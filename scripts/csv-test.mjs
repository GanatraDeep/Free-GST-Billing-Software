// v1.10.66 (#63) — CSV export safety.
//
// Run: `node scripts/csv-test.mjs`
//
// A cell that starts with = + - @ (or a tab / carriage return) is executed as
// a formula when the CSV is opened in Excel, LibreOffice or Google Sheets. The
// exports in Expenses, Purchases and GST Returns wrote such text raw, so a
// client or item name could plant a live formula in someone's ledger.
//
// The other half matters just as much: amounts must come out untouched, or
// the fix breaks every sum a user runs over an exported column.

import { toCsvCell, toCsvLine } from '../src/utils.js';
import { dateOrderNote, parseCsv, toIsoDate, toNum, salesCsvToBills, billsToSalesCsv, purchaseCsvToRecords, purchasesToCsv, SALES_TEMPLATE, PURCHASE_TEMPLATE } from '../src/utils/bulkCsv.js';
import { productsCsvToList } from '../src/utils/listCsv.js';
import { readFileSync } from 'fs';

let passed = 0, failed = 0;
function eq(actual, expected, label) {
  if (actual === expected) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`); }
}

console.log('\n[#63] Formula-like text is written as plain text');
eq(toCsvCell('=HYPERLINK("http://evil.example","Invoice")'),
  `"'=HYPERLINK(""http://evil.example"",""Invoice"")"`,
  'leading = gets an apostrophe, and its quotes are still escaped');
eq(toCsvCell("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0", 'DDE command payload');
eq(toCsvCell('+91 98765 43210'), "'+91 98765 43210", 'leading + (a phone number) stays text');
eq(toCsvCell('@SUM(A1:A9)'), "'@SUM(A1:A9)", 'leading @');
eq(toCsvCell('-2+3'), "'-2+3", 'leading - followed by an expression');
eq(toCsvCell('\t=1+1'), "'\t=1+1", 'leading tab');
eq(toCsvCell('\r=1+1'), `"'\r=1+1"`, 'leading carriage return');

console.log('\n[#63] Real data is left intact');
eq(toCsvCell(-500), '-500', 'negative number');
eq(toCsvCell('-500.00'), '-500.00', 'negative amount string, as toFixed(2) produces');
eq(toCsvCell(1234.5), '1234.5', 'positive number');
eq(toCsvCell(0), '0', 'zero');
eq(toCsvCell('-'), '-', 'a lone dash placeholder');
eq(toCsvCell('Acme Traders'), 'Acme Traders', 'plain text');
eq(toCsvCell('03AAAAA1111A1Z1'), '03AAAAA1111A1Z1', 'GSTIN');
eq(toCsvCell(null), '', 'null');
eq(toCsvCell(undefined), '', 'undefined');

console.log('\n[#63] Quoting still works');
eq(toCsvCell('Mehta, Sons'), '"Mehta, Sons"', 'comma');
eq(toCsvCell('6" pipe'), '"6"" pipe"', 'double quote');
eq(toCsvCell('line one\nline two'), '"line one\nline two"', 'a line break cannot split the row');
eq(toCsvLine(['=1', 'Acme', -20, '']), "'=1,Acme,-20,", 'toCsvLine escapes every cell');

console.log('\n[#101] Bulk CSV import / export of sales and purchase bills');
{
  const rows = parseCsv('﻿a,b\r\n"x, ""y""",2\n"multi\nline",3\n\n');
  eq(JSON.stringify(rows), JSON.stringify([['a', 'b'], ['x, "y"', '2'], ['multi\nline', '3']]), 'parser: BOM, quotes, commas and line breaks in cells, CRLF, blank lines');
  eq([toIsoDate('2026-10-01'), toIsoDate('01-10-2026'), toIsoDate('1/10/26'), toIsoDate('05-Oct-2026'), toIsoDate('31-02-2026')].join(' '),
    '2026-10-01 2026-10-01 2026-10-01 2026-10-05 ', 'dates: ISO, DD-MM-YYYY, D/M/YY, DD-Mon-YYYY; 31 Feb refused');
  eq([toNum('1,234.50'), toNum('₹ 99'), toNum('', 1), Number.isNaN(toNum('abc'))].join(' '), '1234.5 99 1 true', 'numbers: commas, ₹, blank default, text refused');

  const profile = { country: 'India', state: 'Maharashtra', gstin: '27AAAAA0000A1Z5', businessName: 'Acme' };
  const products = [{ id: 'p1', name: 'Steel rod 8mm', hsn: '7214', unit: 'Kg' }];
  const res = salesCsvToBills(SALES_TEMPLATE, { profile, products, adjustStock: true });
  const b = res.bills[0];
  eq(res.bills.length, 1, 'template: two rows with one number make one invoice');
  eq(res.errors.length, 0, 'template imports with no errors');
  eq(b.totalAmount, 1026.6, 'totals worked out like the invoice screen: (720 + 150) + 18% = 1026.60');
  eq([b.data.totals.cgst, b.data.totals.sgst, b.data.totals.igst].join(','), '78.3,78.3,0', 'same state: CGST + SGST');
  eq(JSON.stringify(b.data.stockApplied), '{"p1":-10}', 'stock follows the bill only for the product it names');
  eq(salesCsvToBills(SALES_TEMPLATE, { profile, products }).bills[0].data.stockApplied.p1, undefined, 'without "adjust stock" no product is linked and stock does not move');
  eq(res.newClients.length, 1, 'a client not in the list is offered as a new client');

  const inter = salesCsvToBills(SALES_TEMPLATE.replace(/Maharashtra/g, 'Gujarat'), { profile });
  eq(inter.bills[0].data.totals.igst, 156.6, 'client in another state: IGST');
  eq(salesCsvToBills(SALES_TEMPLATE, { profile, existingIds: new Set(['INV/2026-27/0101']) }).skipped.join(), 'INV/2026-27/0101', 'an invoice number already used is skipped, never overwritten');
  const bos = salesCsvToBills(SALES_TEMPLATE.replace(/Tax Invoice/g, 'Bill of Supply'), { profile });
  eq(bos.bills[0].totalAmount, 870, 'a bill of supply charges no GST');
  const bad = salesCsvToBills('Invoice Number,Date,Client,Item,Qty,Rate\nX1,32-13-2026,A,B,1,5\nX2,2026-10-01,A,B,1,abc\nX3,2026-10-01,,B,1,5', { profile });
  eq(bad.bills.length + ':' + bad.errors.length, '0:3', 'bad date, bad rate and missing client are each reported, nothing half-imported');

  {
    const { SALES_TEMPLATE_CASH_ROW } = await import('../src/utils/bulkCsv.js');
    const j = (a, b2, label) => eq(JSON.stringify(a), JSON.stringify(b2), label);
    j([b.data.details.saleType?.name, b.status, b.payments.length], ['Debit', 'unpaid', 0], 'Sale Type Debit: kept on the invoice, due until a receipt');
    const cashRes = salesCsvToBills(`${SALES_TEMPLATE}\n${SALES_TEMPLATE_CASH_ROW}`, { profile, products, adjustStock: true });
    const cs = cashRes.bills.find((x) => x.invoiceNumber === 'INV/2026-27/0102');
    j([cashRes.errors.length, cs.data.details.saleType?.name, cs.status, cs.payments.map((p) => [p.mode, p.amount, p.date, !!p.cashSale]), cs.paidAmount, cs.totalAmount],
      [0, 'Cash', 'paid', [['cash', 170, '2026-10-02', true]], 170, 170], 'Sale Type Cash: paid in cash on the invoice date (round off Yes: 169.92 -> 170), as the invoice screen does');
    const wrong = salesCsvToBills(SALES_TEMPLATE.replace(/,Debit/g, ',Udhaar'), { profile });
    j([wrong.bills.length, /"Udhaar" is not one of your sale types/.test(wrong.errors.join(' '))], [0, true], 'an unknown Sale Type is an error for that invoice');
    j(salesCsvToBills(SALES_TEMPLATE.replace(/,Debit/g, ',retail debit'), { profile }).bills[0].data.details.saleType?.name, 'Retail Debit', 'Sale Type matched in any case');
    const blank = salesCsvToBills(SALES_TEMPLATE.replace(/,Debit/g, ','), { profile });
    j([blank.bills[0].data.details.saleType, /no Sale Type/.test(blank.warnings.join(' '))], [undefined, true], 'a blank Sale Type with no default type is warned about');
    const saleTypes = [{ id: 'cash', name: 'Cash', payment: 'cash', isDefault: true }, { id: 'debit', name: 'Debit', payment: 'credit' }];
    j(salesCsvToBills(SALES_TEMPLATE.replace(/,Debit/g, ','), { profile, saleTypes }).bills[0].status, 'paid', 'a blank Sale Type takes the default type (Cash here)');
    j(salesCsvToBills(SALES_TEMPLATE.replace(/Tax Invoice/g, 'Quotation').replace(/,Debit/g, ',Cash'), { profile }).bills[0].payments.length, 0, 'a quotation has no sale type and takes no cash');
    const oldFile = 'Invoice Number,Invoice Date,Client Name,Item Name,Quantity,Rate,GST %\nO1,2026-10-01,Old Client,Rice,1,100,5\n';
    j(salesCsvToBills(oldFile, { profile }).bills[0].status, 'unpaid', 'a file without the Sale Type column imports as before');
    const back = salesCsvToBills(billsToSalesCsv(cashRes.bills), { profile, products });
    j(back.bills.map((x) => `${x.data.details.saleType?.name}/${x.status}/${x.totalAmount}`), ['Debit/unpaid/1026.6', 'Cash/paid/170'], 'export -> import keeps the Sale Type');
  }
  {
    const { importedStockFix } = await import('../src/utils/bulkCsv.js');
    const j = (a, b2, label) => eq(JSON.stringify(a), JSON.stringify(b2), label);
    const prods = [{ id: 'p1', name: 'Steel rod 8mm', unit: 'Kg', stock: 100 }, { id: 's1', name: 'Cutting charges', kind: 'service' }];
    const unticked = salesCsvToBills(SALES_TEMPLATE, { profile, products: prods });
    const fix = importedStockFix(unticked.bills, prods);
    j([fix.bills.length, fix.lines, fix.changes, fix.byProduct], [1, 1, { p1: -10 }, [['Steel rod 8mm', -10]]], 'Repair: an invoice imported without stock is linked by name and takes its 10 out (a service line is left alone)');
    j([fix.bills[0].data.items[0].productId, fix.bills[0].data.stockApplied, fix.bills[0].totalAmount], ['p1', { p1: -10 }, unticked.bills[0].totalAmount], 'its stock record is set and the invoice total does not change');
    j(importedStockFix(fix.bills, prods).bills.length, 0, 'running the repair again changes nothing');
    j(importedStockFix(salesCsvToBills(SALES_TEMPLATE, { profile, products: prods, adjustStock: true }).bills, prods).bills.length, 0, 'invoices imported with the box ticked need no repair');
    j(importedStockFix(unticked.bills.map((b) => ({ ...b, status: 'cancelled' })), prods).bills.length, 0, 'a cancelled invoice is not touched');
    j(importedStockFix(unticked.bills.map((b) => ({ ...b, importedAt: undefined })), prods).bills.length, 0, 'an invoice typed in on the screen is not touched');
    j(importedStockFix(salesCsvToBills(SALES_TEMPLATE.replace(/Tax Invoice/g, 'Credit Note'), { profile, products: prods }).bills, prods).changes, { p1: 10 }, 'a credit note puts its stock back');
  }
  const again = salesCsvToBills(billsToSalesCsv(res.bills), { profile, products, adjustStock: true });
  eq(again.bills[0].totalAmount, b.totalAmount, 'export -> import gives the same invoice total');

  const { typesList } = await import('../src/utils/docTypes.js');
  const purchaseTypes = typesList(null, 'purchase');
  const eqj = (a, b, label) => eq(JSON.stringify(a), JSON.stringify(b), label);
  const pur = purchaseCsvToRecords(PURCHASE_TEMPLATE, { profile, purchaseTypes });
  const p = pur.purchases[0];
  eq([pur.purchases.length, p.taxableAmount, Math.round(p.totalTax * 100) / 100, p.totalAmount, p.ownerGstin].join(','), '2,6015,1082.7,7098,27AAAAA0000A1Z5', 'purchase: totals as the purchase form (round off Yes: 7,097.70 -> 7,098), filed under the business');
  eqj([p.applyRoundOff, Math.round(p.roundOff * 100) / 100, p.purchaseType?.name, p.paymentStatus], [true, 0.3, 'Debit', 'Unpaid'], 'Bill Type Debit and Round Off Yes are kept; a Debit bill stays due');
  const c = pur.purchases[1];
  eqj([c.purchaseType?.name, c.paymentStatus, c.payments?.length, c.payments?.[0]?.mode, c.payments?.[0]?.amount, c.applyRoundOff], ['Cash', 'Paid', 1, 'cash', 4410, false], 'Bill Type Cash: paid in cash on the bill date, as the form does');
  const badType = purchaseCsvToRecords(PURCHASE_TEMPLATE.replace(',Debit,Yes', ',Credit card,Yes'), { profile, purchaseTypes });
  eqj([badType.purchases.length, /not one of your purchase types/.test(badType.errors.join(' '))], [1, true], 'an unknown Bill Type is an error for that bill only');
  eq(/Round Off "maybe"/.test(purchaseCsvToRecords(PURCHASE_TEMPLATE.replace(',Debit,Yes', ',Debit,maybe'), { profile, purchaseTypes }).errors.join(' ')), true, 'Round Off must be Yes or No');
  const urd = purchaseCsvToRecords(PURCHASE_TEMPLATE.replace(',Debit,Yes', ',urd,No'), { profile, purchaseTypes }).purchases[0];
  eqj([urd.purchaseType?.urd, urd.applyRoundOff, urd.totalAmount], [true, false, 7097.7], 'Bill Type matched in any case (URD); Round Off No keeps paise');
  const noType = purchaseCsvToRecords(PURCHASE_TEMPLATE.replace(',Debit,Yes', ',,'), { profile, purchaseTypes });
  eqj([noType.purchases[0].purchaseType, /no Bill Type/.test(noType.warnings.join(' '))], [undefined, true], 'a blank Bill Type with no default type is warned about');
  eq(purchaseCsvToRecords(PURCHASE_TEMPLATE.replace(',Debit,Yes', ',,'), { profile, purchaseTypes: purchaseTypes.map((t) => ({ ...t, isDefault: t.id === 'debit' })) }).purchases[0].purchaseType?.name, 'Debit', 'a blank Bill Type takes the default type');
  const paise = purchaseCsvToRecords(PURCHASE_TEMPLATE.replace(',100,60.15,18,', ',10,2000.15,5,'), { profile, purchaseTypes }).purchases[0];
  eqj([paise.totalAmount, paise.roundOff], [21002, 0.42], 'Round off lands on a whole rupee even when the total has more than two decimals (21,001.575 -> 21,002)');
  const oldFile = 'Invoice Number,Invoice Date,Supplier Name,Item Name,Quantity,Rate,GST %,Payment Status\nX1,2026-10-03,Old Supplier,Rice,1,100,5,Paid\n';
  const old = purchaseCsvToRecords(oldFile, { profile }).purchases[0];
  eqj([old.totalAmount, old.paymentStatus, old.applyRoundOff], [105, 'Paid', false], 'a file without the two new columns imports as before');
  eq(purchaseCsvToRecords(PURCHASE_TEMPLATE, { profile, purchaseTypes, existing: [{ supplierGstin: '27AAACG1234K1Z2', invoiceNumber: 'sup/552' }] }).skipped.length, 1, 'a supplier bill already booked is skipped');
  eq(purchaseCsvToRecords(PURCHASE_TEMPLATE.replace(',No,', ',,'), { profile, purchaseTypes, inferInterstate: () => true }).purchases[0].interstate, true, 'blank Inter-state is worked out from the GSTIN');
  const back = purchaseCsvToRecords(purchasesToCsv([p, c]), { profile, purchaseTypes }).purchases;
  eq(back.map((x) => [x.totalAmount, x.purchaseType?.name, x.applyRoundOff].join('/')).join(' '), '7098/Debit/true 4410/Cash/false', 'purchase export -> import round trip keeps Bill Type and Round Off');
}

console.log('\n[HSN-wise inward summary for GSTR-3B]');
{
  const { inwardHsnRows, hsnSheetRows } = await import('../src/utils/hsnSummary.js');
  const purchases = [
    { id: 'a', date: '2026-10-01', items: [{ name: 'COTTONSEED OIL', hsn: '15122910', quantity: 30, rate: 2400, taxPercent: 5 }] },
    { id: 'b', date: '2026-10-06', items: [{ name: 'COTTONSEED OIL', hsn: '15122910', quantity: 75, rate: 2600, taxPercent: 5 }] },
    { id: 'r', date: '2026-10-08', isReturn: true, items: [{ name: 'COTTONSEED OIL', hsn: '15122910', quantity: 5, rate: 2600, taxPercent: 5 }] },
    { id: 'i', date: '2026-10-09', interstate: true, items: [{ name: 'GROUNDNUT OIL', hsn: '15089010', quantity: 10, rate: 3000, taxPercent: 5 }] },
    { id: 'u', date: '2026-10-10', purchaseType: { id: 'urd', name: 'URD', urd: true }, items: [{ name: 'Loose oil', quantity: 2, rate: 500, taxPercent: 5 }] },
    { id: 'po', kind: 'po', date: '2026-10-11', items: [{ name: 'COTTONSEED OIL', hsn: '15122910', quantity: 999, rate: 1, taxPercent: 5 }] },
  ];
  const freight = [{ id: 'f', date: '2026-10-03', transporter: 'T', amount: 4000, rcmRate: 5 }];
  const expenses = [{ id: 'x', date: '2026-10-04', category: 'Rent', amount: 11800, gstAmount: 1800 }];
  const products = [{ name: 'COTTONSEED OIL', unit: 'Tin' }, { name: 'GROUNDNUT OIL', unit: 'Kg' }];
  const rows = inwardHsnRows({ purchases, freight, expenses, products });
  const j = (a, b2, label) => eq(JSON.stringify(a), JSON.stringify(b2), label);
  const cs = rows.find((r) => r.hsn === '15122910');
  j([cs.kind, cs.quantity, cs.taxable, cs.cgst, cs.sgst, cs.igst, cs.uqc], ['ITC', 100, 254000, 6350, 6350, 0, 'CAN'], 'Cottonseed: 30 + 75 - 5 returned = 100 tins, taxable 2,54,000, CGST + SGST, Tin as CAN; a purchase order is left out');
  j([rows.find((r) => r.hsn === '15089010').igst, rows.find((r) => r.hsn === '15089010').uqc], [1500, 'KGS'], 'Inter-state purchase: IGST; unit taken from the product (Kg -> KGS)');
  j(rows.map((r) => r.kind), ['ITC', 'ITC', 'URD', 'RCM', 'EXP'], 'Rows grouped: purchases with ITC, URD, freight under RCM, expenses');
  j([rows[3].hsn, rows[3].taxable, rows[3].totalTax], ['9965', 4000, 200], 'Freight: SAC 9965, 4,000 with 200 under reverse charge');
  j([rows[4].taxable, rows[4].rate, rows[4].totalTax], [10000, 18, 1800], 'Expense with GST: value before GST and its rate worked out');
  const sheet = hsnSheetRows(rows, { inward: true });
  j([sheet[0][0], sheet.length, sheet[sheet.length - 1][0], sheet[sheet.length - 1][6]], ['Type', rows.length + 2, 'Total', 299000], 'Sheet: header, one line per row, total of taxable value');
}

console.log('\n[Review] Import never merges different invoices or double-books a bill');
{
  const head = 'Invoice Number,Invoice Date,Client Name,Client State,Item Name,Quantity,Rate,GST %\n';
  const r = salesCsvToBills(head + '1,2025-04-02,Alpha Traders,Punjab,Pens,1,1000,18\n1,2026-04-03,Beta Stores,Gujarat,Ink,1,1000,18\n',
    { profile: { country: 'India', state: 'Punjab' } });
  eq(r.bills.length, 0, 'Two different invoices sharing a number are not merged into one');
  eq(/different date or client/.test(r.errors.join(' ')), true, 'and the row is named in the error');
  const ok = salesCsvToBills(head + '7,2026-04-03,Alpha Traders,Punjab,Pens,1,100,18\n7,,alpha traders,,Ink,2,50,18\n',
    { profile: { country: 'India', state: 'Punjab' } });
  eq(ok.bills.length === 1 && ok.bills[0].data.items.length === 2, true, 'Item rows of one invoice (blank or same-name repeats) still make one invoice');

  // Export -> import keeps the bill discount and the round-off (977 came back as 1026.6).
  const prof = { country: 'India', state: 'Punjab' };
  const src = salesCsvToBills(head.replace('GST %\n', 'GST %,Bill Discount,Round Off\n') + '9,2026-10-01,Alpha Traders,Punjab,Pens,3,290.3,18,50,Yes\n', { profile: prof });
  const back = salesCsvToBills(billsToSalesCsv(src.bills), { profile: prof });
  eq(`${src.bills[0].totalAmount}`, `${Math.round(3 * 290.3 * 1.18 - 50)}`, 'Bill discount and round-off are applied on import');
  eq(back.bills[0].totalAmount, src.bills[0].totalAmount, 'An exported invoice re-imports to the same total');

  const existing = [{ supplierName: 'Ravi Paper Mart', supplierGstin: '03AAAAA1111A1Z1', invoiceNumber: 'RP-9' }];
  const p = purchaseCsvToRecords('Invoice Number,Invoice Date,Supplier Name,Item Name,Quantity,Rate\nRP-9,2026-10-01,ravi paper mart,A4 Paper,10,250\n', { existing });
  eq(`${p.purchases.length}/${p.skipped.length}`, "0/1", 'A bill saved with a GSTIN is found again from a CSV row with only the supplier name');
}

console.log('\n[Review] Day-first and month-first dates');
{
  eq(dateOrderNote(['13/01/2026', '10/01/2026']).warning, undefined, 'A file with a day over 12 is clearly day first: no warning');
  eq(/10 January 2026/.test(dateOrderNote(['10/01/2026', '2026-01-05']).warning), true, 'Only ambiguous dates: a warning names how one was read');
  eq(/month first/.test(dateOrderNote(['10/25/2026', '10/01/2026']).error), true, 'A month-first file (10/25/2026) is refused as a whole');
  const head = 'Invoice Number,Invoice Date,Client Name,Item Name,Rate\n';
  const us = salesCsvToBills(head + '1,10/25/2026,A,Pen,10\n2,10/01/2026,B,Ink,10\n', { profile: { country: 'India', state: 'Punjab' } });
  eq(`${us.bills.length}/${us.errors.length}`, '0/1', '...so not even its ambiguous rows are imported with swapped dates');
  const p = purchaseCsvToRecords('Invoice Number,Invoice Date,Supplier Name,Item Name,Rate\nX1,03/04/2026,S,Paper,5\n', {});
  eq(`${p.purchases.length}/${p.warnings.filter((w) => /read day first|January|April/i.test(w)).length}`, '1/1', 'Purchases get the same warning');
}

console.log('\n[#132] A GSTIN already saved finds that client, whatever the name');
{
  const profile = { country: 'India', state: 'Punjab' };
  const head = 'Invoice Number,Invoice Date,Client Name,Client GSTIN,Item Name,Rate,GST %\n';
  const clients = [{ id: 'c1', name: 'Sharma Traders', gstin: '03AAACS1234A1Z5', state: 'Punjab', phone: '98100' }];
  const r = salesCsvToBills(head + 'A1,2026-10-01,Sharma Tradres,03aaacs1234a1z5,Pens,100,18\n', { profile, clients });
  eq(r.newClients.length, 0, 'a mistyped name with a saved GSTIN adds no new client');
  eq(r.bills[0].clientName, 'Sharma Traders', '...and the invoice goes to the saved client, by its saved name');
  eq(r.bills[0].data.client.phone, '98100', '...with the saved client details');
  const two = salesCsvToBills(head + 'B1,2026-10-01,New Co,03BBBCN1234B1Z5,Pens,100,18\nB2,2026-10-02,New Company,03BBBCN1234B1Z5,Ink,50,18\n', { profile });
  eq(two.newClients.length, 1, 'two new rows with one GSTIN make one new client, not two');
  eq(two.bills.map((b) => b.clientName).join('|'), 'New Co|New Co', '...and both invoices use its first name');
  eq(salesCsvToBills(head + 'C1,2026-10-01,Sharma Traders,,Pens,100,18\n', { profile, clients }).newClients.length, 0, 'no GSTIN on the row: still found by name');
}

console.log('\n[#134] The Products export imports back, every column');
{
  // The exact file from the report: v1.10.82's own Products export, filled in
  // in Excel (saved as CSV UTF-8, so with a byte-order mark).
  const v82 = '﻿Name,HSN/SAC,Purchase price,Selling price,GST %,Unit,Stock\r\nPVC 2 PIPE 4KG ISI AST,39172390,822,822,18,Ft,0\r\n';
  const p = productsCsvToList(v82, []).products[0];
  eq(JSON.stringify([p.hsn, p.purchasePrice, p.sellingPrice, p.taxPercent, p.unit, p.stock]), JSON.stringify(['39172390', 822, 822, 18, 'Ft', 0]),
    'HSN/SAC, both prices and GST % are read, not only the name');
  // Today's export headings, read from the Products screen itself, so a change
  // to them that the import does not follow fails here.
  const src = readFileSync(new URL('../src/components/InventoryView.jsx', import.meta.url), 'utf8');
  const headers = JSON.parse((/headers=\{(\[[^\]]*\])\}/.exec(src) || [])[1].replace(/'/g, '"'));
  const row = { Name: 'Pen', Type: 'Goods', 'HSN/SAC': '9608', 'Purchase price': 6, 'Selling price': 10, 'GST %': 12, Unit: 'Nos', Stock: 40 };
  const now = productsCsvToList([toCsvLine(headers), toCsvLine(headers.map((h) => row[h] ?? ''))].join('\n'), []).products[0];
  eq(JSON.stringify([now?.hsn, now?.purchasePrice, now?.sellingPrice, now?.taxPercent, now?.unit, now?.stock]), JSON.stringify(['9608', 6, 10, 12, 'Nos', 40]),
    `the screen's own export headings (${headers.join(', ')}) all import`);
}

console.log('\n────────────────────────────────────────');
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed) process.exit(1);
