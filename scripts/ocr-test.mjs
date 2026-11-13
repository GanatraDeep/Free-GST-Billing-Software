// Divtech Hisaab - purchase bill OCR: reading fields from the OCR text
// (node scripts/ocr-test.mjs). The fixture is the text Tesseract read from a
// real scanned Gulab Oil bill (buyer details replaced), the bill reported as
// "info populated is wrong".
import fs from 'fs';
import { parseBillText, repairGstin, isValidGstin, gstinCheckChar, findGstins, parseItemLine, dateIn } from '../src/utils/billOcrParse.js';

let passed = 0, failed = 0;
const eq = (a, b, msg) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) { passed += 1; console.log(`  ✓ ${msg}`); } else { failed += 1; console.log(`  ✗ ${msg}\n     expected: ${JSON.stringify(b)}\n     actual:   ${JSON.stringify(a)}`); }
};
const withCheck = (b) => b + gstinCheckChar(b);

console.log('\n[OCR] GSTIN repair');
eq(isValidGstin('24AAICG0781H1ZO'), true, 'Gulab GSTIN passes the check character');
eq(isValidGstin('24AAICG0781H1ZQ'), false, 'A wrong check character fails');
eq(repairGstin('24aA1CG0781HIZO'), '24AAICG0781H1ZO', '"24aA1CG0781HIZO" (1 for I, I for 1, lower case) -> 24AAICG0781H1ZO');
eq(repairGstin('24AAAPT1234K12V'), '24AAAPT1234K1ZV', '"...K12V" (2 for Z) -> ...K1ZV');
eq(repairGstin('2AAAPT1234K1ZV'), '', 'A 14-character token is not a GSTIN');
eq(findGstins('GSTIN: 24aA1CG0781HIZO  buyer 24AAAPT1234K12V').map((g) => g.gstin), ['24AAICG0781H1ZO', '24AAAPT1234K1ZV'], 'Both GSTINs found, in order');
eq(findGstins('GSTIN24AAICG0781H1ZOyy').map((g) => g.gstin), ['24AAICG0781H1ZO'], 'A GSTIN glued to other text is still found');

console.log('\n[OCR] small readers');
eq(dateIn('Invoice No : BLSR/020455 Date : 01/11/26'), '2026-11-01', '01/11/26 -> 2026-11-01');
eq(dateIn('Dated 5-Nov-2026'), '2026-11-05', '5-Nov-2026 -> 2026-11-05');
const line = parseItemLine('| Gulab Groundnut Oil 15 Kg Tin 2940.000( 15089091 50 TN 50TN | 2800.000( 500] 14000000');
eq(line && [line.name, line.hsn, line.quantity, line.unit, line.rate, line.amount], ['Gulab Groundnut Oil 15 Kg Tin', '15089091', 50, 'TN', 2800, 140000],
  'Item line: 50 TIN x 2800 = 140000 (the amount lost its decimal point, the MRP 2940 is skipped)');
eq(parseItemLine('NAVPURA, TOWER ORAD Invoice No : BLSR/020455 Date : 01/11/26'), null, 'Address / invoice line is not an item');
eq(parseItemLine('Tel. : (0261) 9825121067 Virtual Code : GUFL56H012373'), null, 'Phone line is not an item');

console.log('\n[OCR] the Gulab bill');
const gulab = fs.readFileSync(new URL('./fixtures/ocr-gulab-bill.txt', import.meta.url), 'utf8');
const catalog = [{ id: 'p1', name: 'GROUNDNUT OIL', hsn: '1508', taxPercent: 5, unit: 'TIN' }, { id: 'p2', name: 'COTTONSEED OIL', hsn: '1512', taxPercent: 5 }];
const own = '24AAAPT1234K1ZV';
let r = parseBillText(gulab, { catalog, ownGstin: own });
eq(r.supplierGstin, '24AAICG0781H1ZO', 'Supplier GSTIN 24AAICG0781H1ZO (misread on the scan, repaired)');
eq(r.supplierName, 'GULAB OIL AND FOOD (AHMEDABAD) PVT. LTD.', 'Supplier name from the top of the bill, noise cut off');
eq(r.invoiceNumber, 'BLSR/020455', 'Invoice no. BLSR/020455 (not "To" from "Bill To")');
eq(r.date, '2026-11-01', 'Date 01/11/26');
eq(r.grandTotal, 147158, 'Grand total 147158');
eq([r.taxBreakdown.taxableValue, r.taxBreakdown.cgst, r.taxBreakdown.sgst, r.taxBreakdown.igst, r.taxBreakdown.roundOff], [140000, 3503.75, 3503.75, 0, 0.5], 'Basic 140000, CGST and SGST 3503.75 each, round off 0.50');
eq(r.taxRate, 5, 'GST rate 5% from tax / (basic + charges)');
eq(r.items.length, 2, 'Two lines: the oil, and the insurance & packing charges (no junk rows)');
eq([r.items[0].name, r.items[0].billName, r.items[0].hsn, r.items[0].quantity, r.items[0].rate, r.items[0].taxPercent], ['GROUNDNUT OIL', 'Gulab Groundnut Oil 15 Kg Tin', '15089091', 50, 2800, 5], 'Oil matched to the saved product GROUNDNUT OIL; HSN from the bill, 50 x 2800 @ 5%');
eq(r.items[1].name, 'Insurance & packing charges', 'Charges row named Insurance & packing charges');
eq([r.items[1].charge, r.items[1].quantity, r.items[1].rate, r.items[1].taxPercent], [true, 1, 150, 5], 'Charges line 150 @ 5%');
eq(r.checks.map((c) => c.ok), [true, true, true], 'All three self-checks agree (items = basic, GST = 7007.50, total = 147158)');
eq([r.interstate, r.applyRoundOff, r.warnings.length], [false, true, 0], 'Intra-state, round off on, no warnings');

// Your supplier list gives the exact name, matched by GSTIN.
r = parseBillText(gulab, { catalog, ownGstin: own, suppliers: [{ id: 's9', name: 'Gulab Oil & Food Pvt Ltd', gstin: '24AAICG0781H1ZO', address: 'Ahmedabad' }] });
eq([r.supplierName, r.matchedSupplier?.id, r.supplierAddress], ['Gulab Oil & Food Pvt Ltd', 's9', 'Ahmedabad'], 'Supplier taken from your list by GSTIN');
// Without a product list the bill's own name is used.
r = parseBillText(gulab, { ownGstin: own });
eq([r.items[0].name, r.items[0].taxPercent], ['Gulab Groundnut Oil 15 Kg Tin', 5], 'No product list: bill name kept, rate from the tax breakdown');

console.log('\n[OCR] another layout: IGST, two items, Bill To above the items');
const seller = withCheck('27AABCS1234D1Z');
const buyer = withCheck('24AAAPT1234K1Z');
const other = `SHREE GANESH OIL TRADERS
Plot 12, APMC Market, Pune 411037 Ph: 020 2426 1111
GSTIN: ${seller.replace('Z', '2')}
TAX INVOICE
Invoice No: SG/2026-27/0457 Dated: 05-Nov-2026
Bill To: SAMPLE TRADERS, Surat
GSTIN: ${buyer}  State Code: 24
Sr Description HSN Qty Rate Amount
1 Sunflower Oil 1 Ltr Pouch 15121910 120 Nos 145.00 17,400.00
2 Mustard Oil 5 Ltr Jar 15149120 20 Jar 720.00 14,400.00
Taxable Value 31,800.00
IGST @ 5% 1,590.00
Grand Total 33,390.00
Amount in words: Thirty Three Thousand Three Hundred Ninety Only`;
r = parseBillText(other, { ownGstin: buyer, catalog: [{ id: 'm', name: 'Mustard Oil', taxPercent: 5 }] });
eq([r.supplierGstin, r.supplierName], [seller, 'SHREE GANESH OIL TRADERS'], 'Supplier GSTIN and name; your own GSTIN is skipped');
eq([r.invoiceNumber, r.date], ['SG/2026-27/0457', '2026-11-05'], 'Invoice no. and date');
eq(r.items.map((i) => [i.quantity, i.rate, i.amount, i.hsn]), [[120, 145, 17400, '15121910'], [20, 720, 14400, '15149120']], 'Two items with qty, rate, amount, HSN');
eq(r.items[1]._matchedProductId, 'm', 'Mustard Oil 5 Ltr Jar matched to Mustard Oil');
eq([r.taxBreakdown.igst, r.taxBreakdown.cgst, r.interstate, r.taxRate, r.grandTotal], [1590, 0, true, 5, 33390], 'IGST 1590 -> inter-state, 5%, total 33390');
eq(r.checks.every((c) => c.ok), true, 'Self-checks agree');

console.log('\n[OCR] nothing readable');
r = parseBillText('blurry photo\nnothing here', {});
eq([r.supplierGstin, r.invoiceNumber, r.items.length], ['', '', 0], 'Empty fields, no invented items');
eq(r.warnings.length, 2, 'Warns that GSTIN and items need typing in');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
