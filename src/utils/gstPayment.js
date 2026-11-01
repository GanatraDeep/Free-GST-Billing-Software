// Divtech Hisaab - the accounting entry for a month's GSTR-3B: credit of one
// head used against another (IGST credit paying CGST, say) and the tax paid
// in cash, with interest and late fee. Same order of set-off as setOffITC in
// utils.js (the rule in section 49 / 49A). Pure; tested in ledger-test.mjs.
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const HEADS = ['igst', 'cgst', 'sgst'];

// Moves of credit between heads: [{ from, to, amount }], and what is left to pay.
export function gstSetOffMoves(liability = {}, credit = {}) {
  const due = Object.fromEntries(HEADS.map((h) => [h, r2(liability[h])]));
  const left = Object.fromEntries(HEADS.map((h) => [h, r2(credit[h])]));
  const moves = [];
  const pay = (from, to, cap = Infinity) => {
    const amt = r2(Math.min(left[from], due[to], cap));
    if (amt <= 0) return;
    left[from] = r2(left[from] - amt); due[to] = r2(due[to] - amt);
    moves.push({ from, to, amount: amt });
  };
  pay('igst', 'igst');
  pay('igst', 'cgst', Math.max(0, due.cgst - left.cgst));
  pay('igst', 'sgst', Math.max(0, due.sgst - left.sgst));
  pay('igst', 'cgst'); pay('igst', 'sgst');
  pay('cgst', 'cgst'); pay('cgst', 'igst');
  pay('sgst', 'sgst'); pay('sgst', 'igst');
  return { moves, payable: due, carry: left };
}

// Voucher lines: credit moved between heads, the cash paid on each head
// (and cess), interest and late fee, all from `from` (cash, bank or a CC).
export function gstPaymentLines({ moves = [], cash = {}, rcm = 0, interest = 0, lateFee = 0, from = 'bank' }) {
  const net = new Map();
  const add = (acc, amt) => net.set(acc, r2((net.get(acc) || 0) + amt));
  for (const m of moves) if (m.from !== m.to) { add(`gst:${m.to}`, m.amount); add(`gst:${m.from}`, -m.amount); }
  let paid = 0;
  for (const h of [...HEADS, 'cess']) { const a = r2(cash[h]); if (a > 0) { add(`gst:${h}`, a); paid += a; } }
  // GST under reverse charge (freight from a GTA...) is paid in cash too.
  if (r2(rcm) > 0) { add('rcm-payable', r2(rcm)); paid += r2(rcm); }
  if (r2(interest) > 0) { add('expense:GST interest', r2(interest)); paid += r2(interest); }
  if (r2(lateFee) > 0) { add('expense:GST late fee', r2(lateFee)); paid += r2(lateFee); }
  if (paid > 0) add(from, -r2(paid));
  return [...net].filter(([, v]) => Math.abs(v) >= 0.005).map(([account, v]) => ({ account, dr: v > 0 ? v : 0, cr: v < 0 ? -v : 0 }));
}
