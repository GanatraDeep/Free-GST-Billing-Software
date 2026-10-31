// Divtech Hisaab - opening balance checks (node scripts/opening-test.mjs).
import {
  openingDue, openingPaid, validateOpening, cleanOpening, openingFor, openingOutstandingEntries,
  openingCsvToList, openingToCsv, parseDay, OPENING_SAMPLE,
} from '../src/utils/openingBalances.js';
import { partyOutstanding, supplierOutstanding, periodMonths } from '../src/utils/partyOutstanding.js';

let passed = 0, failed = 0;
const eq = (a, b, msg) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) { passed += 1; console.log(`  ✓ ${msg}`); } else { failed += 1; console.log(`  ✗ ${msg}\n     expected: ${JSON.stringify(b)}\n     actual:   ${JSON.stringify(a)}`); }
};

console.log('\n[Opening] balance and payments');
const owed = { party: 'client', name: 'Shree Ram Kirana', amount: 45000, direction: 'owed', asOn: '2026-10-31', payments: [] };
eq(openingDue(owed), 45000, 'Nothing paid: the whole balance is open');
const part = { ...owed, payments: [{ id: 'p1', date: '2026-11-05', amount: 10000.5 }, { id: 'p2', date: '2026-11-20', amount: 4999.5 }] };
eq([openingPaid(part), openingDue(part)], [15000, 30000], 'Part paid: paid and still open add up');
eq(openingDue({ ...owed, payments: [{ date: '2026-11-05', amount: 45000 }] }), 0, 'Fully paid: nothing open');
eq(openingDue({ ...owed, direction: 'advance', amount: 5000 }), -5000, 'An advance is a credit (minus)');

console.log('\n[Opening] checks before saving');
eq(validateOpening(owed), '', 'A complete balance can be saved');
eq(validateOpening({ ...owed, party: 'friend' }), 'Choose Client or Supplier.', 'Party must be client or supplier');
eq(validateOpening({ ...owed, name: '  ' }), 'Enter the party name.', 'A name is needed');
eq(validateOpening({ ...owed, amount: 0 }), 'Enter an amount more than 0.', 'Zero is refused');
eq(validateOpening({ ...owed, amount: 'abc' }), 'Enter an amount more than 0.', 'Text is refused');
eq(validateOpening({ ...owed, asOn: '31/10/2026' }), 'Enter the date the balance is as on.', 'The date must be a real date');
eq(validateOpening({ ...owed, payments: [{ date: '2026-11-05', amount: 50000 }] }), 'The payments add up to more than the opening balance.', 'Cannot pay more than the balance');
eq(validateOpening({ ...owed, direction: 'advance', payments: [{ date: '2026-11-05', amount: 10 }] }), 'Payments can only be recorded on a balance that is owed.', 'No payments on an advance');
const cleaned = cleanOpening({ ...owed, name: '  Shree   Ram  ', amount: '100.456', extra: 'x', id: 'ob_1' });
eq([cleaned.name, cleaned.amount, 'extra' in cleaned, cleaned.id], ['Shree Ram', 100.46, false, 'ob_1'], 'Saved tidy: name spaces, 2 decimals, only known fields');

console.log('\n[Opening] finding a party');
const list = [owed, { party: 'supplier', name: 'Saurashtra Oil Mills', amount: 320000, direction: 'owed', asOn: '2026-10-31', payments: [] }];
eq(openingFor(list, 'client', ' shree ram KIRANA ')?.amount, 45000, 'Found by name, ignoring case and spaces');
eq(openingFor(list, 'supplier', 'Shree Ram Kirana'), null, 'A client is not found as a supplier');

console.log('\n[Opening] in the outstanding reports');
const months = periodMonths('fy', 2026);
const bills = [{ invoiceType: 'tax-invoice', clientName: 'Shree Ram Kirana', invoiceDate: '2026-11-10', totalAmount: 1180, status: 'unpaid', paidAmount: 0, data: { totals: {} } }];
const rows = partyOutstanding(bills, months, 'INR', openingOutstandingEntries(list, 'client'));
eq([rows.length, rows[0].months['2026-10'], rows[0].months['2026-11'], rows[0].total], [1, 45000, 1180, 46180], 'Client: opening in its month, invoice in its month, one total');
const early = partyOutstanding([], months, 'INR', openingOutstandingEntries([{ ...owed, asOn: '2025-03-31' }], 'client'));
eq([early[0].earlier, early[0].total], [45000, 45000], 'Opening from before the year goes in Earlier');
const sup = supplierOutstanding([], months, openingOutstandingEntries(list, 'supplier'));
eq([sup[0].name, sup[0].total], ['Saurashtra Oil Mills', 320000], 'Supplier: opening balance shows as owed');
const adv = partyOutstanding(bills, months, 'INR', openingOutstandingEntries([{ ...owed, direction: 'advance', amount: 500 }], 'client'));
eq(adv[0].total, 680, 'An advance reduces what the client owes');

console.log('\n[Opening] CSV import (Miracle / Tally lists)');
const sample = openingCsvToList(OPENING_SAMPLE);
eq([sample.list.length, sample.errors.length], [3, 0], 'The sample file imports without errors');
eq(sample.list.map((o) => [o.party, o.direction, o.amount]), [['client', 'owed', 45000], ['client', 'advance', 5000], ['supplier', 'owed', 320000]], 'Dr/Cr and type become owed or advance');
const miracle = openingCsvToList('Ledger Name,Closing Balance\nA Traders,"12,500.00 Dr"\nB Mills,"80,000.00 Cr"\nC Shop,0\n', { defaultAsOn: '2026-10-31' });
eq(miracle.list.map((o) => [o.name, o.party, o.direction, o.amount, o.asOn]), [['A Traders', 'client', 'owed', 12500, '2026-10-31'], ['B Mills', 'supplier', 'owed', 80000, '2026-10-31']], 'No type column: Dr is a client, Cr a supplier; zero rows skipped');
eq(miracle.skipped, 1, 'The zero balance is counted as skipped');
const neg = openingCsvToList('Party,Group,Amount,Date\nX Agencies,Sundry Debtors,-2000,31/10/2026\nY Oils,Sundry Creditors,-1500,31-10-2026\n');
eq(neg.list.map((o) => [o.party, o.direction, o.asOn]), [['client', 'advance', '2026-10-31'], ['supplier', 'owed', '2026-10-31']], 'A minus amount is Cr (Tally / Miracle style); Indian date formats read');
const bad = openingCsvToList('Name,Amount\nGood,100\nBad,abc\n', { defaultAsOn: '2026-10-31' });
eq([bad.list.length, bad.errors.length, /Row 3/.test(bad.errors[0])], [1, 1, true], 'A bad amount is reported with its row number');
eq(openingCsvToList('Name,Amount\nNo Date,100\n').errors[0], 'Row 2 (No Date): Enter the date the balance is as on.', 'No date in the file and none given: asked for');
eq(openingCsvToList('Foo,Bar\n1,2').errors[0], 'The first row must have column names, with at least Name and Amount.', 'A file without the needed columns is refused');
const dup = openingCsvToList('Name,Amount,Date\nA,1,2026-10-31\na ,2,2026-10-31\n');
eq([dup.list.length, dup.errors.length], [1, 1], 'The same party twice: first row kept, second reported');
eq([parseDay('5/4/2026'), parseDay('2026-4-5'), parseDay('April 5')], ['2026-04-05', '2026-04-05', ''], 'Dates: d/m/yyyy and yyyy-m-d, nothing else');
const back = openingCsvToList(openingToCsv(sample.list.map((o) => ({ ...o, payments: [] }))));
eq(back.list.map((o) => [o.party, o.direction, o.amount]), sample.list.map((o) => [o.party, o.direction, o.amount]), 'Export then import gives the same balances');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
