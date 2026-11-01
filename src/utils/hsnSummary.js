// Divtech Hisaab - HSN-wise summary of INWARD supplies for the GSTR-3B
// export (the outward one is GSTR-1 Table 12, built in GSTReturns). Asked:
// "In gst export we will need HSN wise summary for inward / outward in GSTR3-B".
//
// One row per HSN + GST rate + UQC + kind, net of purchase returns:
//   kind 'ITC'   purchase bills that give input tax credit
//   kind 'URD'   bills from unregistered dealers (no credit)
//   kind 'RCM'   freight from a transporter, tax under reverse charge (SAC 9965)
//   kind 'EXP'   expenses with GST (no HSN is recorded on an expense)
// Pure functions only, so scripts/csv-test.mjs can test them.
import { hsnUqc, roundQty } from '../utils.js';
import { purchaseLineTax } from './purchaseOrders.js';
import { freightTax } from './freight.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const INWARD_KIND_LABEL = {
  ITC: 'Purchases (ITC)',
  URD: 'Purchases from unregistered dealers (no ITC)',
  RCM: 'Freight under reverse charge (GTA)',
  EXP: 'Expenses with GST',
};
// SAC for goods transport agency services.
export const GTA_SAC = '9965';

/**
 * Inward HSN rows for a period. Pass the period's own records:
 *   purchases (bills and returns; purchase orders are left out), freight, expenses,
 *   products (to find the unit of a purchase line by its name).
 * Returns rows { kind, hsn, description, uqc, rate, quantity, taxable, igst, cgst, sgst, cess, totalTax, total }.
 */
export function inwardHsnRows({ purchases = [], freight = [], expenses = [], products = [] } = {}) {
  const unitOf = new Map((products || []).map((p) => [String(p.name || '').trim().toLowerCase(), p.unit || '']));
  const map = new Map();
  const add = (kind, hsn, description, uqc, rate, q, taxable, tax, cess, interstate) => {
    const key = `${kind}|${hsn}|${rate}|${uqc}`;
    if (!map.has(key)) map.set(key, { kind, hsn, description, uqc, rate, quantity: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
    const r = map.get(key);
    r.quantity += q;
    r.taxable += taxable;
    if (interstate) r.igst += tax;
    else { r.cgst += tax / 2; r.sgst += tax / 2; }
    r.cess += cess;
  };
  for (const p of purchases || []) {
    if ((p.kind || 'bill') === 'po') continue;
    const sign = p.isReturn ? -1 : 1;
    const kind = p.purchaseType?.urd ? 'URD' : 'ITC';
    for (const it of p.items || []) {
      const { amount, tax, cess } = purchaseLineTax(it);
      if (!amount && !tax) continue;
      const unit = it.unit || unitOf.get(String(it.name || '').trim().toLowerCase()) || '';
      const hsn = String(it.hsn || '').trim() || 'N/A';
      add(kind, hsn, it.name || '', hsnUqc({ hsn, unit }), Number(it.taxPercent) || 0,
        sign * (Number(it.quantity) || 0), sign * amount, sign * tax, sign * cess, !!p.interstate);
    }
  }
  for (const f of freight || []) {
    const x = freightTax(f);
    if (!x.taxable) continue;
    add('RCM', GTA_SAC, 'Goods transport (freight)', 'NA', x.rate, 0, x.taxable, x.tax, 0, !!f.interstate);
  }
  for (const e of expenses || []) {
    const gst = Number(e.gstAmount) || 0;
    if (!(gst > 0)) continue;
    const taxable = (Number(e.amount) || 0) - gst;
    const rate = taxable > 0 ? Math.round((gst / taxable) * 100 * 2) / 2 : 0;
    add('EXP', 'N/A', e.category || 'Expense', 'NA', rate, 0, taxable, gst, 0, !!e.interstate);
  }
  const order = { ITC: 0, URD: 1, RCM: 2, EXP: 3 };
  return [...map.values()]
    .map((r) => {
      const out = { ...r, quantity: roundQty(r.quantity), taxable: r2(r.taxable), igst: r2(r.igst), cgst: r2(r.cgst), sgst: r2(r.sgst), cess: r2(r.cess) };
      out.totalTax = r2(out.igst + out.cgst + out.sgst + out.cess);
      out.total = r2(out.taxable + out.totalTax);
      return out;
    })
    .filter((r) => r.taxable || r.totalTax || r.quantity)
    .sort((a, b) => order[a.kind] - order[b.kind] || String(a.hsn).localeCompare(String(b.hsn)) || a.rate - b.rate);
}

// Rows for an Excel sheet: header, one line per HSN, then the total.
export function hsnSheetRows(rows, { inward = false } = {}) {
  const head = [...(inward ? ['Type'] : []), 'HSN/SAC', 'Description', 'UQC', 'Total quantity', 'GST rate %', 'Taxable value', 'IGST', 'CGST', 'SGST/UTGST', 'Cess', 'Total tax', 'Total value'];
  const body = rows.map((r) => [...(inward ? [INWARD_KIND_LABEL[r.kind] || r.kind] : []), r.hsn, r.description, r.uqc, r.quantity, r.rate,
    r2(r.taxable), r2(r.igst), r2(r.cgst), r2(r.sgst), r2(r.cess), r2(r.totalTax ?? (r.igst + r.cgst + r.sgst + r.cess)), r2(r.total ?? (r.taxable + r.igst + r.cgst + r.sgst + r.cess))]);
  const sum = (k) => r2(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0));
  const totalTax = r2(rows.reduce((s, r) => s + (Number(r.igst) || 0) + (Number(r.cgst) || 0) + (Number(r.sgst) || 0) + (Number(r.cess) || 0), 0));
  const total = [...(inward ? ['Total'] : []), inward ? '' : 'Total', '', '', '', '', sum('taxable'), sum('igst'), sum('cgst'), sum('sgst'), sum('cess'), totalTax, r2(sum('taxable') + totalTax)];
  return [head, ...body, total];
}
