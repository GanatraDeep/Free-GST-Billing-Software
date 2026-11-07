// Divtech Hisaab - the final accounts laid out two ways, from profitAndLoss
// and balanceSheet (utils/ledgers.js):
//   book   T-form as written in a ledger book: debit on the left, credit on
//          the right ("To ..." / "By ..."), both sides adding to one total
//   modern vertical, one column, as in Schedule III
// Each line: { label, amount, id?, bold?, indent?, head?, total? }.
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (rows) => r2(rows.reduce((t, r) => t + (r.head || r.total ? 0 : Number(r.amount) || 0), 0));
const line = (label, amount, extra = {}) => ({ label, amount: r2(amount), ...extra });

// ---- Trading account ------------------------------------------------------
export function tradingBook(pl) {
  const gp = pl.grossProfit;
  const left = [
    line('To Opening stock', pl.openingStock, { id: 'stock-open' }),
    ...pl.purchases.map((r) => line(`To ${r.name}`, r.net, { id: r.id })),
    ...pl.directExpenses.map((r) => line(`To ${r.name}`, r.net, { id: r.id })),
    ...(gp >= 0 ? [line('To Gross profit c/d', gp, { bold: true })] : []),
  ];
  const right = [
    ...pl.sales.map((r) => line(`By ${r.name}`, -r.net, { id: r.id })),
    ...pl.directIncomes.map((r) => line(`By ${r.name}`, -r.net, { id: r.id })),
    line('By Closing stock', pl.closingStock, { id: 'closing-stock' }),
    ...(gp < 0 ? [line('By Gross loss c/d', -gp, { bold: true })] : []),
  ];
  return { title: 'Trading account', left, right, totalLeft: sum(left), totalRight: sum(right) };
}

// ---- Profit & loss account -----------------------------------------------
export function pnlBook(pl) {
  const gp = pl.grossProfit; const np = pl.netProfit;
  const left = [
    ...(gp < 0 ? [line('To Gross loss b/d', -gp)] : []),
    ...pl.indirectExpenses.map((r) => line(`To ${r.name}`, r.net, { id: r.id })),
    ...(np >= 0 ? [line('To Net profit (transferred to capital account)', np, { bold: true })] : []),
  ];
  const right = [
    ...(gp >= 0 ? [line('By Gross profit b/d', gp)] : []),
    ...pl.indirectIncomes.map((r) => line(`By ${r.name}`, -r.net, { id: r.id })),
    ...(np < 0 ? [line('By Net loss (transferred to capital account)', -np, { bold: true })] : []),
  ];
  return { title: 'Profit & loss account', left, right, totalLeft: sum(left), totalRight: sum(right) };
}

// ---- Vertical (modern) trading and profit & loss ------------------------
export function pnlModern(pl) {
  const t = pl.totals;
  const rows = [
    line('Trading account', 0, { head: true }),
    line('Sales (before GST)', t.sales, { indent: 1 }),
    ...(Math.abs(t.directIncomes) >= 0.005 ? [line('Add: Direct incomes', t.directIncomes, { indent: 1 })] : []),
    line('Less: Cost of goods sold', 0, { head: true, indent: 1 }),
    line('Opening stock', pl.openingStock, { indent: 2, id: 'stock-open' }),
    ...pl.purchases.map((r) => line(`Add: ${r.name}`, r.net, { indent: 2, id: r.id })),
    ...pl.directExpenses.map((r) => line(`Add: ${r.name}`, r.net, { indent: 2, id: r.id })),
    line('Less: Closing stock', -pl.closingStock, { indent: 2, id: 'closing-stock' }),
    line('Cost of goods sold', r2(pl.openingStock + t.purchases + t.directExpenses - pl.closingStock), { indent: 1, total: true }),
    line(pl.grossProfit >= 0 ? 'Gross profit' : 'Gross loss', pl.grossProfit, { bold: true, total: true }),
    line('Profit & loss account', 0, { head: true }),
    line(pl.grossProfit >= 0 ? 'Gross profit b/d' : 'Gross loss b/d', pl.grossProfit, { indent: 1 }),
    ...pl.indirectIncomes.map((r) => line(`Add: ${r.name}`, -r.net, { indent: 1, id: r.id })),
    ...pl.indirectExpenses.map((r) => line(`Less: ${r.name}`, -r.net, { indent: 1, id: r.id })),
    line(pl.netProfit >= 0 ? 'Net profit' : 'Net loss', pl.netProfit, { bold: true, total: true }),
  ];
  return rows;
}

// ---- Balance sheet ---------------------------------------------------------
// The capital account is laid out the way a CA writes it: the capital
// accounts, then profit added and drawings taken off.
const CAPITAL_LABEL = { 'pl-period': 'Add: Net profit for the period', 'pl-earlier': 'Add: Profit before this period', drawings: 'Less: Drawings' };
function capitalItems(g) {
  const order = (i) => (i.id === 'drawings' ? 3 : i.id === 'pl-period' ? 2 : i.id === 'pl-earlier' ? 1 : 0);
  return [...g.items].sort((a, b) => order(a) - order(b)).map((i) => {
    const loss = (i.id === 'pl-period' || i.id === 'pl-earlier') && i.amount < 0;
    const label = loss ? (i.id === 'pl-period' ? 'Less: Net loss for the period' : 'Less: Loss before this period') : (CAPITAL_LABEL[i.id] || i.name);
    return { ...i, name: label };
  });
}
const groupLines = (groups) => groups.flatMap((g) => [
  line(g.name, g.total, { head: true, groupTotal: true }),
  ...(g.group === 'capital' ? capitalItems(g) : g.items).map((i) => line(i.name, i.amount, { id: i.id, indent: 1 })),
]);

export function balanceSheetBook(bs) {
  const left = groupLines(bs.liabilities);
  const right = groupLines(bs.assets);
  return { title: 'Balance sheet', leftTitle: 'Liabilities', rightTitle: 'Assets', left, right, totalLeft: bs.totalLiabilities, totalRight: bs.totalAssets };
}

export function balanceSheetModern(bs) {
  return [
    line('Capital and liabilities', 0, { head: true }),
    ...groupLines(bs.liabilities).map((l) => ({ ...l, indent: (l.indent || 0) + 1 })),
    line('Total', bs.totalLiabilities, { bold: true, total: true }),
    line('Assets', 0, { head: true }),
    ...groupLines(bs.assets).map((l) => ({ ...l, indent: (l.indent || 0) + 1 })),
    line('Total', bs.totalAssets, { bold: true, total: true }),
  ];
}

// ---- Trial balance grouped (book) ----------------------------------------
export function trialBalanceBook(tb, groupName = (g) => g) {
  const out = [];
  let group = null;
  for (const r of tb.rows) {
    if (r.group !== group) {
      group = r.group;
      const inGroup = tb.rows.filter((x) => x.group === group);
      const net = r2(inGroup.reduce((t, x) => t + x.net, 0));
      out.push({ label: groupName(group), dr: net > 0 ? net : 0, cr: net < 0 ? -net : 0, head: true });
    }
    out.push({ label: r.name, id: r.id, dr: r.net > 0 ? r2(r.net) : 0, cr: r.net < 0 ? r2(-r.net) : 0, indent: 1 });
  }
  return out;
}

// Rows for Print / Excel: a T-form side by side, then the totals.
export function bookExportRows(book) {
  const n = Math.max(book.left.length, book.right.length);
  const rows = [];
  const cell = (l) => (l ? [`${'   '.repeat(l.indent || 0)}${l.label}`, l.head && !l.groupTotal ? '' : l.amount] : ['', '']);
  for (let i = 0; i < n; i += 1) rows.push([...cell(book.left[i]), ...cell(book.right[i])]);
  rows.push(['Total', book.totalLeft, 'Total', book.totalRight]);
  return rows;
}
export const modernExportRows = (rows) => rows.map((l) => [`${'   '.repeat(l.indent || 0)}${l.label}`, l.head ? '' : l.amount]);
