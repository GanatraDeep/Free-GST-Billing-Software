// Divtech Hisaab - totals of the invoices the Dashboard list is showing
// (after search and filters): the amount as well as the count. Counted the
// way the Dashboard cards count sales: a credit note takes away, quotations,
// delivery challans and cancelled documents add nothing (they are counted
// apart), and each currency is kept apart.
import { salesSign, amountDue, isCancelledBill } from '../utils.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const currencyOf = (b) => b.currency || b.data?.invoiceOptions?.currency || 'INR';

/**
 * Returns { count, sales, creditNotes, other, cancelled,
 *   byCurrency: { INR: { amount, taxable, tax, received, due } } }.
 * amount: invoice totals less credit notes. received / due: on the sales only
 * (a paid invoice is fully received; otherwise what is paid on it so far).
 */
export function listTotals(bills = []) {
  const out = { count: bills.length, sales: 0, creditNotes: 0, other: 0, cancelled: 0, byCurrency: {} };
  for (const b of bills) {
    const sign = salesSign(b);
    if (sign === 0) {
      if (isCancelledBill(b)) out.cancelled += 1; else out.other += 1;
      continue;
    }
    if (sign > 0) out.sales += 1; else out.creditNotes += 1;
    const cur = currencyOf(b);
    const c = out.byCurrency[cur] || (out.byCurrency[cur] = { amount: 0, taxable: 0, tax: 0, received: 0, due: 0 });
    const total = Number(b.totalAmount) || 0;
    const tax = Number(b.totalTaxAmount) || 0;
    c.amount += sign * total;
    c.tax += sign * tax;
    c.taxable += sign * (Number(b.data?.totals?.taxableAmount) || (total - tax));
    if (sign > 0) {
      const owed = amountDue(b);
      const due = b.status === 'paid' ? 0 : Math.max(0, owed - (Number(b.paidAmount) || 0));
      c.due += due;
      c.received += Math.max(0, owed - due);
    }
  }
  for (const c of Object.values(out.byCurrency)) for (const k of Object.keys(c)) c[k] = r2(c[k]);
  return out;
}
