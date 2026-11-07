// Divtech Hisaab - what an expense costs and what was paid, in one place.
//
// Normal expense: the vendor charged GST. `amount` is what you paid,
// including the GST; the GST (`gstAmount`) is input credit.
//
// Reverse charge (`rcm: true`): the vendor is not registered, e.g. a shop or
// office rented from an unregistered landlord. `amount` is what you paid the
// vendor, with no GST in it. You pay the GST (`gstAmount`, worked out on top)
// to the government with GSTR-3B under reverse charge, and claim the same
// amount back as input credit (GSTR-3B 3.1(d) and 4(A)(3)).
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const isRcmExpense = (e) => !!e?.rcm;
// Money that left cash / bank / CC for this expense.
export const expensePaid = (e) => r2(e?.amount);
// GST on it (input credit; under reverse charge also owed to the government).
export const expenseGst = (e) => r2(e?.gstAmount);
// What it costs the business: the value before GST (goes to the P&L).
export const expenseCost = (e) => (isRcmExpense(e) ? r2(e?.amount) : r2((Number(e?.amount) || 0) - (Number(e?.gstAmount) || 0)));

// GST from the amount and rate typed on the form: inside the amount
// normally, on top of it under reverse charge.
export function expenseGstFrom(amount, percent, rcm = false) {
  const base = Number(amount) || 0;
  const pct = Number(percent) || 0;
  if (!(base > 0) || !(pct > 0)) return 0;
  return r2(rcm ? (base * pct) / 100 : (base * pct) / (100 + pct));
}

// IGST, or CGST + SGST half each, of an expense's GST.
export function expenseGstSplit(e) {
  const gst = expenseGst(e);
  if (e?.interstate) return { igst: gst, cgst: 0, sgst: 0 };
  const half = r2(gst / 2);
  return { igst: 0, cgst: half, sgst: r2(gst - half) };
}

// Reverse-charge expenses of a list: value and tax for GSTR-3B 3.1(d).
export function rcmExpenseTotals(list = []) {
  const t = { taxable: 0, igst: 0, cgst: 0, sgst: 0, tax: 0 };
  for (const e of list) {
    if (!isRcmExpense(e) || !(expenseGst(e) > 0)) continue;
    const s = expenseGstSplit(e);
    t.taxable += expenseCost(e); t.igst += s.igst; t.cgst += s.cgst; t.sgst += s.sgst; t.tax += expenseGst(e);
  }
  for (const k of Object.keys(t)) t[k] = r2(t[k]);
  return t;
}
