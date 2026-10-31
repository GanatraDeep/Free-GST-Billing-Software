// Divtech Hisaab - invoice series checks (node scripts/series-test.mjs).
import {
  seriesForBusiness, defaultSeries, seriesCounterKey, formatSeriesNumber, seriesProblem, cleanSeries, seriesOfBill,
} from '../src/utils/invoiceSeries.js';

let passed = 0, failed = 0;
const eq = (a, b, msg) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) { passed += 1; console.log(`  ✓ ${msg}`); } else { failed += 1; console.log(`  ✗ ${msg}\n     expected: ${JSON.stringify(b)}\n     actual:   ${JSON.stringify(a)}`); }
};

const A = cleanSeries({ id: 's1', name: 'Retail cash', prefix: 'A', separator: '/', showFinYear: true, fyStyle: 'short', padDigits: 4, resetYearly: true });
const AB = cleanSeries({ id: 's2', name: 'Retail credit', prefix: 'AB', separator: '-', showFinYear: false, padDigits: 0, resetYearly: true, isDefault: true });
const BB = cleanSeries({ id: 's3', name: 'Dealer credit', prefix: 'BB', separator: '', showFinYear: false, padDigits: 0, resetYearly: false, business: '24ABCDE1234F1Z5' });

console.log('\n[Series] number formats');
eq(formatSeriesNumber(A, 7, '2026-27'), 'A/26-27/0007', 'A/26-27/0007: short year, 4 digits');
eq(formatSeriesNumber({ ...A, fyStyle: 'full' }, 7, '2026-27'), 'A/2026-27/0007', 'Full year when chosen');
eq(formatSeriesNumber(AB, 1546, '2026-27'), 'AB-1546', 'AB-1546: no year, no padding');
eq(formatSeriesNumber(BB, 12, '2026-27'), 'BB12', 'BB12: no separator');

console.log('\n[Series] counters');
eq(seriesCounterKey(A, '2026-27'), 'counter_SER_s1@2026-27', 'A yearly series counts per financial year');
eq(seriesCounterKey(BB, '2026-27'), 'counter_SER_s3', 'A series that never restarts has one counter');
eq(seriesCounterKey(A, '2026-27') === seriesCounterKey(AB, '2026-27'), false, 'Each series has its own counter');

console.log('\n[Series] which series a business sees');
const list = [A, AB, BB, cleanSeries({ id: 's4', name: 'Old', prefix: 'Z', archived: true })];
eq(seriesForBusiness(list, '24ABCDE1234F1Z5').map((s) => s.prefix), ['A', 'AB', 'BB'], 'Shared ones plus its own; archived hidden');
eq(seriesForBusiness(list, 'OTHER').map((s) => s.prefix), ['A', 'AB'], "Another business's own series is not shown");
eq(seriesForBusiness(list, 'OTHER', { includeArchived: true }).length, 3, 'Archived shown when asked (Settings)');
eq(defaultSeries(seriesForBusiness(list, 'X')).prefix, 'AB', 'The series marked default comes first for new invoices');
eq(defaultSeries([A, BB]).prefix, 'A', 'No default marked: the first one');
eq(defaultSeries([]), null, 'No series: none');

console.log('\n[Series] checks before saving');
const others = [A, AB, BB];
eq(seriesProblem({ name: 'Cash', prefix: 'C' }, others), '', 'A new series C is fine');
eq(seriesProblem({ name: '', prefix: 'C' }, others), 'Give the series a name, such as Retail cash.', 'A name is needed');
eq(seriesProblem({ name: 'X', prefix: 'a/b' }, others), 'The prefix can have only letters and digits (up to 8), such as A, AB or BB.', 'Only letters and digits');
eq(seriesProblem({ name: 'X', prefix: 'ab' }, others), 'AB is already the prefix of Retail credit.', 'Prefix must be unique (any capitals)');
eq(seriesProblem({ ...A }, others), '', 'Saving a series again does not clash with itself');
eq(seriesProblem({ name: 'retail CASH', prefix: 'Q1' }, others), 'There is already a series called Retail cash.', 'Name must be unique');
eq(seriesProblem({ name: 'X', prefix: 'INV' }, others), 'INV is used by the app for other documents. Choose another prefix.', 'App prefixes are refused');
eq(seriesProblem({ name: 'X', prefix: 'GOT' }, others, { brandPrefix: 'got' }), 'GOT is your standard invoice prefix. Choose another.', 'Standard brand prefix refused');
eq(seriesProblem({ name: 'X', prefix: 'A2', separator: '' }, others), 'With no separator the prefix must end in a letter (A1 is fine, A11 would be unclear).', 'No separator: prefix ends in a letter');
eq(/16/.test(seriesProblem({ name: 'Long', prefix: 'ABCDEFGH', fyStyle: 'full', padDigits: 6 }, others)), true, 'Numbers over 16 characters are refused (GST rule)');
eq(cleanSeries({ name: '  Retail   cash ', prefix: ' A ', padDigits: 9, separator: '*', junk: 1 }).padDigits, 6, 'Saved tidy: digits capped at 6');

console.log('\n[Series] series of a saved invoice');
eq(seriesOfBill({ invoiceNumber: 'X', data: { details: { seriesId: 's2' } } }, others)?.prefix, 'AB', 'From the stored series id');
eq(seriesOfBill({ invoiceNumber: 'AB-15' }, others)?.prefix, 'AB', 'Older invoice: from the number AB-15');
eq(seriesOfBill({ invoiceNumber: 'A/26-27/0003' }, others)?.prefix, 'A', 'A/26-27/0003 is A, not AB');
eq(seriesOfBill({ invoiceNumber: 'BB12' }, others)?.prefix, 'BB', 'BB12 is BB');
eq(seriesOfBill({ invoiceNumber: 'INV/2026-27/0001' }, others), null, 'A standard number belongs to no series');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
