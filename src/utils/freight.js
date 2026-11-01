// Divtech Hisaab - freight (jakat / bhada) paid to transporters for goods
// brought in, each booked to a freight account for that goods (Freight -
// Groundnut oil, Freight - Cotton seed oil...). Freight from a goods transport
// agency (GTA) is under reverse charge (RCM): you pay its GST yourself, in
// cash, and then take it back as input tax credit. GSTR-3B 3.1(d) and 4(A)(3).
// Pure: shared by the Freight screen, GST returns, the accounts and the server.

export const FREIGHT_RATES = [
  [5, '5% RCM (GTA, no input credit taken by the transporter)'],
  [12, '12% RCM'],
  [18, '18% RCM'],
  [0, 'No GST (exempt / not under RCM)'],
];
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

// The freight account of a goods: "Freight - Groundnut oil".
export const freightAccountName = (goods) => (String(goods || '').trim() ? `Freight - ${String(goods).trim()}` : 'Freight inward');

// GST under reverse charge on one freight entry.
export function freightTax(f) {
  const taxable = r2(f?.amount);
  const rate = Number(f?.rcmRate) || 0;
  const tax = r2(taxable * rate / 100);
  if (f?.interstate) return { taxable, rate, igst: tax, cgst: 0, sgst: 0, tax };
  const half = r2(tax / 2);
  return { taxable, rate, igst: 0, cgst: half, sgst: r2(tax - half), tax };
}

export function freightProblem(f) {
  if (!isDate(f?.date)) return 'Enter the date.';
  if (!(Number(f?.amount) > 0)) return 'Enter the freight amount.';
  if (!text(f?.transporter, 200)) return 'Enter the transporter.';
  if (!FREIGHT_RATES.some(([r]) => r === Number(f?.rcmRate))) return 'Pick the GST rate.';
  return '';
}

export function cleanFreight(f) {
  return {
    id: text(f.id, 60) || `frt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    date: f.date,
    goods: text(f.goods, 120),
    transporter: text(f.transporter, 200),
    transporterGstin: text(f.transporterGstin, 20).toUpperCase(),
    lrNo: text(f.lrNo, 40), vehicleNo: text(f.vehicleNo, 20).toUpperCase(),
    fromPlace: text(f.fromPlace, 80), toPlace: text(f.toPlace, 80),
    againstBill: text(f.againstBill, 60),
    amount: r2(f.amount),
    rcmRate: Number(f.rcmRate) || 0,
    interstate: !!f.interstate,
    paymentMode: text(f.paymentMode, 30) || 'cash', // 'credit' = payable to the transporter
    account: text(f.account, 80),
    note: text(f.note, 300),
    ownerGstin: text(f.ownerGstin, 20), ownerName: text(f.ownerName, 200),
    createdAt: text(f.createdAt, 40) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Totals of the RCM on a set of freight entries.
export const freightRcmTotals = (list = []) => list.reduce((t, f) => {
  const x = freightTax(f);
  if (!x.rate) return { ...t, exempt: r2(t.exempt + x.taxable) };
  return { taxable: r2(t.taxable + x.taxable), igst: r2(t.igst + x.igst), cgst: r2(t.cgst + x.cgst), sgst: r2(t.sgst + x.sgst), tax: r2(t.tax + x.tax), exempt: t.exempt };
}, { taxable: 0, igst: 0, cgst: 0, sgst: 0, tax: 0, exempt: 0 });
