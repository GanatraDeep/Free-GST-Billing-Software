// Divtech Hisaab - the Reports screen's profit and loss, from the same books
// as Final accounts (utils/ledgers.js), so the two always show one profit.
// It used to work profit out on its own (sales - cost of goods sold -
// expense entries) and missed freight, vouchers, kasar, interest, round off
// and purchases of items not in the product list.
import { profitAndLoss, openingStockWarnings } from './ledgers.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(y, m, 0).getDate();

// The calendar months a range touches, each clipped to the range.
export function monthsIn(from, to) {
  if (!from || !to || from > to) return [];
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    const start = `${y}-${pad(m)}-01`;
    const end = `${y}-${pad(m)}-${pad(lastDay(y, m))}`;
    out.push({ key: `${y}-${pad(m)}`, from: start < from ? from : start, to: end > to ? to : end });
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

const summarise = (pl) => {
  const t = pl.totals;
  const goodsCost = r2(pl.openingStock + t.purchases - pl.closingStock);
  const direct = r2(t.directExpenses - t.directIncomes);
  return {
    sales: r2(t.sales),
    openingStock: r2(pl.openingStock), purchases: r2(t.purchases), closingStock: r2(pl.closingStock),
    goodsCost, directExpenses: r2(t.directExpenses), directIncomes: r2(t.directIncomes), direct,
    grossProfit: r2(pl.grossProfit),
    expenses: r2(t.indirectExpenses), otherIncome: r2(t.indirectIncomes),
    netProfit: r2(pl.netProfit),
  };
};

/**
 * { ...summary, months: [{ key, ...summary }], warnings }
 * summary: sales, openingStock, purchases, closingStock, goodsCost (opening +
 * purchases - closing), directExpenses (freight...), grossProfit, expenses
 * (indirect), otherIncome, netProfit - all as in Final accounts.
 * warnings: products whose opening stock has no purchase price.
 */
export function booksPnl(data = {}, { from = '', to = '' } = {}) {
  const total = summarise(profitAndLoss(data, { from, to }));
  const months = monthsIn(from, to).map((mo) => ({ key: mo.key, ...summarise(profitAndLoss(data, mo)) }))
    .filter((m) => m.sales || m.purchases || m.goodsCost || m.direct || m.expenses || m.otherIncome);
  return { ...total, months, warnings: openingStockWarnings(data) };
}
