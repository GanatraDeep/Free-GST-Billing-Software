// Divtech Hisaab - Rojmel (day book): money in (jama) and out (udhar) day by
// day with the opening and closing balance of each day, and a day-wise
// summary of the business (sales, purchases, expenses, cash and bank).
// Built from the same double-entry postings as the ledgers and final
// accounts (utils/ledgers.js), so it always agrees with them.
import { postings, accountInfo } from './ledgers.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// The money accounts to choose from: Cash, Bank, and your own bank / CC accounts.
export function rojmelAccounts(data = {}) {
  const own = (data.accounts || []).filter((a) => ['bank-accounts', 'cc'].includes(a.group))
    .map((a) => ({ id: `acc:${a.id}`, name: a.name, group: a.group }));
  return [{ id: 'cash', name: 'Cash', group: 'cash-in-hand' }, { id: 'bank', name: 'Bank', group: 'bank-accounts' }, ...own];
}

// Every money account id, for "Cash + all banks".
export const allMoneyIds = (data = {}) => rojmelAccounts(data).map((a) => a.id);

// What a posting is, in a word, from its document.
const KIND = {
  bill: 'Sale', pay: 'Received on invoice', rcp: 'Receipt', rcpd: 'Receipt', markpaid: 'Receipt', obp: 'Receipt', tds: 'Receipt',
  pur: 'Purchase', ppay: 'Payment', pmark: 'Payment', ptds: 'Payment', exp: 'Expense', frt: 'Freight',
  cb: 'Cash / bank book', v: 'Voucher', ob: 'Opening', os: 'Opening', acc: 'Opening', adj: 'Stock',
};
export const kindOf = (doc) => KIND[String(doc || '').split(':')[0]] || 'Entry';

/**
 * Rojmel for one or more money accounts.
 * ids: account ids (['cash'], or all money accounts). Entries moving money
 * between two of the chosen accounts (cash deposited in the bank, with both
 * picked) are left out: they change neither the total nor the day.
 * Returns { opening, days: [{ date, opening, in, out, closing, entries }], totalIn, totalOut, closing }.
 */
export function rojmel(data = {}, ids = ['cash'], { from = '', to = '', all = null } = {}) {
  const set = new Set(ids);
  const ps = all || postings(data);
  const rows = ps.filter((p) => set.has(p.account));
  // A document whose money lines all stay inside the chosen accounts is a transfer between them.
  const net = new Map();
  const touches = new Map();
  for (const p of ps) {
    if (!set.has(p.account)) { touches.set(p.doc, true); continue; }
    net.set(p.doc, (net.get(p.doc) || 0) + p.dr - p.cr);
  }
  const internal = (doc) => !touches.get(doc) && Math.abs(net.get(doc) || 0) < 0.005;
  let opening = 0;
  const byDay = new Map();
  for (const p of rows) {
    if (internal(p.doc)) continue;
    const d = p.date || '';
    if (from && d < from) { opening += p.dr - p.cr; continue; }
    if (to && d > to) continue;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(p);
  }
  let bal = r2(opening);
  const days = [...byDay.keys()].sort().map((date) => {
    const entries = byDay.get(date).map((p) => ({
      key: p.key, doc: p.doc, kind: kindOf(p.doc), account: p.account, particulars: p.particulars, ref: p.ref || '',
      in: r2(p.dr), out: r2(p.cr),
    })).sort((a, b) => (b.in - a.in) || (a.out - b.out));
    const dayIn = r2(entries.reduce((s, e) => s + e.in, 0));
    const dayOut = r2(entries.reduce((s, e) => s + e.out, 0));
    const day = { date, opening: bal, in: dayIn, out: dayOut, closing: r2(bal + dayIn - dayOut), entries };
    bal = day.closing;
    return day;
  });
  return {
    opening: r2(opening), days,
    totalIn: r2(days.reduce((s, d) => s + d.in, 0)), totalOut: r2(days.reduce((s, d) => s + d.out, 0)),
    closing: bal,
  };
}

/**
 * Day-wise summary of the business for each day with any entry:
 * sales (net of credit notes), purchases (net of returns), expenses, GST on
 * sales, cash in / out, bank in / out (Bank and your bank / CC accounts) and
 * the cash and bank balance at the end of the day. Counts of sale invoices
 * and purchase bills too.
 */
export function dayWiseSummary(data = {}, { from = '', to = '', all = null } = {}) {
  const ps = all || postings(data);
  const bankIds = new Set(rojmelAccounts(data).filter((a) => a.id !== 'cash').map((a) => a.id));
  const days = new Map();
  const blank = (date) => ({ date, sales: 0, invoices: new Set(), purchases: 0, bills: new Set(), expenses: 0, gstOnSales: 0, cashIn: 0, cashOut: 0, bankIn: 0, bankOut: 0 });
  let cashOpen = 0;
  let bankOpen = 0;
  for (const p of ps) {
    const d = p.date || '';
    const money = p.account === 'cash' ? 'cash' : bankIds.has(p.account) ? 'bank' : '';
    if (from && d < from) {
      if (money === 'cash') cashOpen += p.dr - p.cr;
      if (money === 'bank') bankOpen += p.dr - p.cr;
      continue;
    }
    if (to && d > to) continue;
    if (!days.has(d)) days.set(d, blank(d));
    const x = days.get(d);
    const pre = String(p.doc).split(':')[0];
    if (p.account === 'sales') { x.sales += p.cr - p.dr; if (pre === 'bill') x.invoices.add(p.doc); }
    else if (p.account === 'purchases') { x.purchases += p.dr - p.cr; if (pre === 'pur') x.bills.add(p.doc); }
    else if (p.account.startsWith('expense:') && pre !== 'adj') x.expenses += p.dr - p.cr;
    else if (p.account.startsWith('gst:') && pre === 'bill') x.gstOnSales += p.cr - p.dr;
    if (money === 'cash') { x.cashIn += p.dr; x.cashOut += p.cr; }
    if (money === 'bank') { x.bankIn += p.dr; x.bankOut += p.cr; }
  }
  let cash = r2(cashOpen);
  let bank = r2(bankOpen);
  const rows = [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map((x) => {
    cash = r2(cash + x.cashIn - x.cashOut);
    bank = r2(bank + x.bankIn - x.bankOut);
    return {
      date: x.date, sales: r2(x.sales), invoices: x.invoices.size, purchases: r2(x.purchases), bills: x.bills.size,
      expenses: r2(x.expenses), gstOnSales: r2(x.gstOnSales),
      cashIn: r2(x.cashIn), cashOut: r2(x.cashOut), bankIn: r2(x.bankIn), bankOut: r2(x.bankOut),
      cashClosing: cash, bankClosing: bank,
    };
  }).filter((x) => x.sales || x.purchases || x.expenses || x.gstOnSales || x.cashIn || x.cashOut || x.bankIn || x.bankOut);
  const sum = (k) => r2(rows.reduce((s, x) => s + x[k], 0));
  return {
    cashOpening: r2(cashOpen), bankOpening: r2(bankOpen), rows,
    totals: {
      sales: sum('sales'), invoices: rows.reduce((s, x) => s + x.invoices, 0), purchases: sum('purchases'), bills: rows.reduce((s, x) => s + x.bills, 0),
      expenses: sum('expenses'), gstOnSales: sum('gstOnSales'), cashIn: sum('cashIn'), cashOut: sum('cashOut'), bankIn: sum('bankIn'), bankOut: sum('bankOut'),
    },
    cashClosing: cash, bankClosing: bank,
  };
}

export const accountName = (id, data = {}) => accountInfo(id, data.accounts || []).name;
