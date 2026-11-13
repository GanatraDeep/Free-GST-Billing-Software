// Divtech Hisaab - turning the text OCR read from a purchase bill into the
// fields of a purchase entry. Reported: "info populated is wrong" on a
// scanned Gulab Oil bill. The OCR (Tesseract) read the bill well; the old
// rules in BillOCR.jsx took "To" from "Bill To" as the invoice number, a line
// of scanner noise as the supplier, every address / phone / IRN line with two
// numbers as an item, and missed the GSTIN over one misread letter.
//
// parseBillText(text, { catalog, suppliers, ownGstin }) returns
//   { supplierName, supplierGstin, supplierAddress, matchedSupplier,
//     invoiceNumber, date, grandTotal, taxBreakdown, items, charges,
//     taxRate, checks, warnings }
// Pure functions: tested in scripts/ocr-test.mjs on real OCR text.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const STD_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40];

// ---- GSTIN -------------------------------------------------------------------
// 2 digits (state), 5 letters, 4 digits, 1 letter (PAN), 1 entity code, 'Z',
// 1 check character. OCR swaps look-alike characters; each position says
// whether it wants a digit or a letter, so the swap can be undone.
const TO_DIGIT = { O: '0', D: '0', Q: '0', U: '0', I: '1', L: '1', '|': '1', '!': '1', T: '1', Z: '2', S: '5', B: '8', G: '6', A: '4', E: '3' };
const TO_LETTER = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 8: 'B', 6: 'G', 4: 'A', 3: 'E', 7: 'T' };
const KIND = ['d', 'd', 'l', 'l', 'l', 'l', 'l', 'd', 'd', 'd', 'd', 'l', 'x', 'z', 'x'];
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function gstinCheckChar(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const v = CHARS.indexOf(first14[i]);
    if (v < 0) return '';
    const p = v * (i % 2 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}
export const isValidGstin = (g) => /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(g || '') && gstinCheckChar(g.slice(0, 14)) === g[14];

// A 15-character OCR token -> the GSTIN it most likely is, or ''.
export function repairGstin(token) {
  const raw = String(token || '').toUpperCase().replace(/[^A-Z0-9|!]/g, '');
  if (raw.length !== 15) return '';
  const fixed = raw.split('').map((c, i) => {
    const k = KIND[i];
    if (k === 'd') return /\d/.test(c) ? c : (TO_DIGIT[c] || c);
    if (k === 'l') return /[A-Z]/.test(c) ? c : (TO_LETTER[c] || c);
    if (k === 'z') return 'Z';
    return c === '|' || c === '!' ? '1' : c;
  });
  const base = fixed.join('');
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(base)) return '';
  if (isValidGstin(base)) return base;
  // The entity code (usually a digit) and the check character can be either:
  // try the look-alikes there and keep one whose check character is right.
  const alts = (c) => [...new Set([c, TO_DIGIT[c], TO_LETTER[c]].filter(Boolean))];
  for (const e of alts(base[12])) {
    for (const ch of alts(base[14])) {
      const g = `${base.slice(0, 12)}${e}Z${ch}`;
      if (isValidGstin(g)) return g;
    }
  }
  return base; // right shape, check character not confirmed
}

// Every GSTIN on the bill, in reading order: [{ gstin, valid, index }].
export function findGstins(text) {
  const out = [];
  const scan = (re) => {
    for (const m of String(text).matchAll(re)) {
      const g = repairGstin(m[1] ?? m[0]);
      if (g && !out.some((x) => x.gstin === g)) out.push({ gstin: g, valid: isValidGstin(g), index: m.index });
    }
  };
  // A token of its own first; then any 15 characters (a GSTIN glued to noise),
  // keeping only those that pass the check character.
  scan(/(?<![A-Za-z0-9])([0-9OoDQIl|][0-9OoDQIl|Zz][A-Za-z0-9|]{13})(?![A-Za-z0-9])/g);
  const before = out.length;
  scan(/(?=([0-9OoDQIl|][0-9OoDQIl|Zz][A-Za-z0-9|]{13}))/g);
  const extra = out.splice(before).filter((g) => g.valid);
  return [...out, ...extra].sort((a, b) => a.index - b.index);
}

// ---- small helpers -------------------------------------------------------------
const numIn = (s) => [...String(s).matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].map((m) => ({ text: m[0], value: Number(m[0].replace(/,/g, '')), index: m.index, end: m.index + m[0].length }));
const STOP = new Set(['and', 'the', 'pvt', 'ltd', 'private', 'limited', 'llp', 'co', 'company', 'm/s', 'ms']);
const tokens = (s) => new Set(String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length >= 2 && !STOP.has(t)));
// Share of the catalog name's words found in the bill's name (1 = all of them).
function nameScore(billName, catalogName) {
  const a = tokens(billName); const b = tokens(catalogName);
  if (!a.size || !b.size) return 0;
  const hit = [...b].filter((t) => a.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return Math.max(hit / b.size * (hit >= Math.min(2, b.size) ? 1 : 0.6), hit / union);
}
function bestMatch(name, list, key = 'name', min = 0.75) {
  let best = null; let score = min;
  for (const x of list || []) {
    const s = nameScore(name, x[key]);
    if (s > score || (s === score && best && String(x[key]).length > String(best[key]).length)) { best = x; score = s; }
  }
  return best ? { item: best, score } : null;
}

// ---- dates -------------------------------------------------------------------
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export function dateIn(s) {
  const m1 = String(s).match(/\b(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2,4})\b/);
  const m2 = String(s).match(/\b(\d{1,2})[\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,-]*(\d{2,4})\b/i);
  const m = m1 || m2;
  if (!m) return '';
  const d = Number(m[1]); const mo = m1 ? Number(m[2]) : MONTHS[m[2].slice(0, 3).toLowerCase()];
  let y = Number(m[3]); if (y < 100) y += 2000;
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 2000 || y > 2100) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ---- labelled amounts ------------------------------------------------------------
// The amount after a label on its line: the last number there that is not a
// percentage (so "CGST @ 2.5% 3503.75" and "CGST 3503.75" both give 3503.75).
function amountAfter(lines, labelRe, { allowNegative = false } = {}) {
  for (const line of lines) {
    const m = line.match(labelRe);
    if (!m) continue;
    const rest = line.slice(m.index + m[0].length);
    const nums = numIn(rest).filter((n) => !/^\s*%/.test(rest.slice(n.end - 0, n.end + 2)) && !/%/.test(rest.slice(n.end, n.end + 2)));
    const pick = nums.length ? nums[nums.length - 1] : null;
    if (pick && isFinite(pick.value) && (allowNegative || pick.value >= 0)) return r2(pick.value);
  }
  return 0;
}

// ---- items ----------------------------------------------------------------------
const UNIT_RE = /^(tin|tn|tins|nos?|pcs?|pieces?|kgs?|kilo|ltrs?|l|litres?|bags?|box(es)?|ctn|cartons?|doz|dozen|mt|qtl|pkts?|btls?|bottles?|jars?|cans?|sets?|units?|bundles?|rolls?|mtrs?|sqft|pair|drums?|barrels?)\b/i;
const END_ITEMS = /^\W*(total|sub\s*total|basic\s*amount|taxable|\[?\s*bil+\s*no|bill\s*no|amount\s*in\s*words|rs\.?\s*:|grand\s*total|cgst|sgst|igst|e\.?\s*&\s*o\.?\s*e)/i;
const NOT_ITEM = /\b(gstin|pan|fssai|irn|e-?way|ack\.?\s*no|ifsc|bank|branch|phone|tel|mobile|email|www\.|invoice\s*no|order\s*no|vehicle|transporter|pin|state\s*code|place\s*of\s*supply|due\s*date|ref\.?\s*no)\b/i;

// One table line -> { name, hsn, quantity, unit, rate, amount, taxPercent } or null.
export function parseItemLine(line) {
  const clean = line.replace(/[|[\]{}()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length < 6 || NOT_ITEM.test(clean)) return null;
  const nums = numIn(clean);
  if (nums.length < 2) return null;
  // The name runs up to the first "column" number: one with decimals or 3+ digits.
  const firstCol = nums.find((n) => /\./.test(n.text) || n.text.replace(/[^\d]/g, '').length >= 3);
  if (!firstCol) return null;
  let name = clean.slice(0, firstCol.index).replace(/^\s*\d{1,3}\s*[.)-]?\s+/, '').trim();
  if (!/[A-Za-z]{3,}/.test(name)) return null;
  const after = nums.filter((n) => n.index >= firstCol.index);
  const hsnN = after.find((n) => /^\d{4}$|^\d{6}$|^\d{8}$/.test(n.text));
  const hsn = hsnN ? hsnN.text : '';
  let qty = null; let unit = '';
  for (const n of after) {
    const tail = clean.slice(n.end).trim();
    const u = tail.match(UNIT_RE);
    if (u && n !== hsnN && n.value > 0) { qty = n.value; unit = u[0].toUpperCase(); break; }
  }
  const pctN = after.find((n) => /^\s*%/.test(clean.slice(n.end, n.end + 2)));
  const pool = after.filter((n) => n !== hsnN && n !== pctN && n.value > 0);
  const qtys = qty != null ? [qty] : pool.filter((n) => n.value < 100000).map((n) => n.value);
  // Find rate x qty = amount; the amount may have lost its decimal point
  // (140000.00 read as 14000000).
  let found = null;
  for (const q of qtys) {
    for (const rN of pool) {
      if (rN.value === q && qty == null) continue;
      for (const aN of pool) {
        if (aN === rN) continue;
        for (const scale of [1, 100, 1000, 10]) {
          const a = aN.value / scale;
          const expect = q * rN.value;
          if (expect > 0 && Math.abs(a - expect) / expect < 0.011) {
            if (!found || scale < found.scale || (scale === found.scale && aN.index > found.aIndex)) found = { q, rate: rN.value, amount: r2(expect), scale, aIndex: aN.index };
          }
        }
      }
    }
  }
  if (!found) return null;
  name = name.replace(/\s{2,}/g, ' ').replace(/[^\w)]+$/, '').trim();
  const taxPercent = pctN && STD_RATES.includes(pctN.value) ? pctN.value : null;
  return { name, hsn, quantity: found.q, unit, rate: r2(found.rate), amount: found.amount, taxPercent };
}

export function parseItems(lines) {
  const headerIdx = lines.findIndex((l) => /(description|particulars|item|product|goods)/i.test(l) && /(qty|quantity|hsn|rate|amount)/i.test(l));
  const start = headerIdx >= 0 ? headerIdx + 1 : 0;
  const items = [];
  for (let i = start; i < lines.length; i += 1) {
    const l = lines[i];
    if (headerIdx >= 0 && END_ITEMS.test(l)) break;
    if (headerIdx >= 0 && /^\s*(paid|code|rate|%|no\.?)\b/i.test(l)) continue; // second header line
    const it = parseItemLine(l);
    if (it) items.push(it);
  }
  return items;
}

// Extra charges under the table: "INSU & PACK. CHARGES 150.00", "Freight 200".
export function parseCharges(lines) {
  const out = [];
  for (const l of lines) {
    const m = l.match(/(insu(?:rance)?\.?\s*(?:&|and)?\s*pack(?:ing|\.)?\s*charges?|packing\s*(?:&|and)?\s*forwarding|packing\s*charges?|forwarding\s*charges?|freight(?:\s*charges?)?|transport(?:ation)?\s*charges?|cartage|loading\s*charges?|insurance(?:\s*charges?)?|other\s*charges?)/i);
    if (!m || /discount/i.test(l.slice(m.index))) continue;
    const amt = amountAfter([l.slice(m.index)], new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    if (amt > 0) out.push({ label: m[0].replace(/\s+/g, ' ').trim(), amount: amt });
  }
  return out;
}

// "INSU & PACK. CHARGES" -> "Insurance & packing charges".
export function chargeName(label) {
  const t = String(label).toLowerCase().replace(/\binsu\b\.?/, 'insurance').replace(/\bpack\b\.?/, 'packing').replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---- the whole bill ---------------------------------------------------------------
export function parseBillText(rawText, { catalog = [], suppliers = [], ownGstin = '' } = {}) {
  const text = String(rawText || '');
  const lines = text.split(/\n+/).map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
  const warnings = [];

  // Supplier: the first GSTIN on the bill that is not your own (yours is the
  // "Bill to" one), then your supplier list by GSTIN, then by name.
  const own = repairGstin(ownGstin) || String(ownGstin || '').toUpperCase();
  const gstins = findGstins(text).filter((g) => g.gstin !== own && !(own && g.gstin.slice(2, 12) === own.slice(2, 12)));
  const pick = gstins.find((g) => g.valid) || gstins[0];
  let supplierGstin = pick ? pick.gstin : '';
  let matchedSupplier = supplierGstin ? (suppliers || []).find((s) => repairGstin(s.gstin) === supplierGstin) : null;

  // Name from the top of the bill: the first line with a company word, above "Bill to".
  const billToIdx = lines.findIndex((l) => /\b(bill\s*to|buyer|billed\s*to|consignee|ship\s*to|details\s*of\s*receiver)\b/i.test(l));
  const top = lines.slice(0, billToIdx > 0 ? billToIdx : Math.min(15, lines.length));
  const COMPANY = /\b(pvt|private|ltd|limited|llp|traders|trading|industries|enterprises?|corporation|agency|agencies|mills?|company|& co|and co|sons|brothers|foods?|oils?|stores?|marketing|distributors?|udyog)\b/i;
  let nameLine = top.find((l) => COMPANY.test(l) && (l.replace(/[^A-Z]/g, '').length / Math.max(1, l.replace(/[^A-Za-z]/g, '').length)) > 0.6 && !/tax\s*invoice/i.test(l)) || '';
  if (nameLine) {
    // Cut OCR noise before the first capitalised word and after "LTD." / "LLP".
    nameLine = nameLine.replace(/^.*?(?=\b[A-Z][A-Z&.]{1,}\b(?:\s+[A-Z&(][A-Z&.()]*){1,})/, '');
    const cut = nameLine.match(/^(.*?\b(?:LTD|LIMITED|LLP)\b\.?)/i);
    if (cut) nameLine = cut[1];
    nameLine = nameLine.replace(/\s+[^A-Za-z(]{1,4}$/, '').trim();
  }
  if (!matchedSupplier && nameLine) {
    const m = bestMatch(nameLine, suppliers, 'name', 0.7);
    if (m) matchedSupplier = m.item;
  }
  if (matchedSupplier && !supplierGstin && matchedSupplier.gstin) supplierGstin = matchedSupplier.gstin;
  const supplierName = matchedSupplier ? matchedSupplier.name : nameLine;
  if (pick && !pick.valid) warnings.push(`Supplier GSTIN ${pick.gstin} does not pass the GSTIN check: compare it with the bill.`);
  if (!supplierGstin) warnings.push('No supplier GSTIN found: type it in, or pick the supplier.');

  // Invoice number: only after "Invoice No", "Bill No", "Inv. No".
  let invoiceNumber = ''; let invLine = '';
  for (const re of [/\b(?:tax\s*)?invoice\s*(?:no|number|#)\.?\s*[:.-]?\s*([A-Z0-9][A-Z0-9/-]{1,24})/i, /\b(?:bill|inv|voucher)\s*\.?\s*(?:no|number|#)\.?\s*[:.-]?\s*([A-Z0-9][A-Z0-9/-]{1,24})/i]) {
    for (const l of lines) {
      const m = l.match(re);
      if (m && /\d/.test(m[1]) && !/^date/i.test(m[1])) { invoiceNumber = m[1].replace(/[-/]+$/, ''); invLine = l; break; }
    }
    if (invoiceNumber) break;
  }

  // Date: on the invoice number's line, else after "Invoice date" / "Date", else the first.
  let date = invLine ? dateIn(invLine.slice(invLine.indexOf(invoiceNumber) + invoiceNumber.length)) : '';
  if (!date) { const l = lines.find((x) => /\b(invoice|bill)\s*date\b/i.test(x)); if (l) date = dateIn(l.slice(l.search(/date/i))); }
  if (!date) { const l = lines.find((x) => /\bdate\b/i.test(x) && dateIn(x)); if (l) date = dateIn(l); }
  if (!date) date = dateIn(text);

  // Totals and tax.
  const grandTotal = amountAfter(lines, /\b(grand\s*total|net\s*payable|amount\s*payable|total\s*amount|bill\s*amount|invoice\s*total|net\s*amount)\b/i)
    || amountAfter(lines.filter((l) => !/sub\s*total/i.test(l)), /\btotal\b/i);
  const tb = {
    taxableValue: amountAfter(lines, /\b(taxable\s*(?:value|amount|amt)|basic\s*amount|assessable\s*value|sub\s*-?\s*total)\b/i),
    cgst: amountAfter(lines, /\bc\s*gst\b(?:\s*@?\s*[\d.]+\s*%)?/i),
    sgst: amountAfter(lines, /\b(?:s\s*gst|ut\s*gst)\b(?:\s*@?\s*[\d.]+\s*%)?/i),
    igst: amountAfter(lines, /\bi\s*gst\b(?:\s*@?\s*[\d.]+\s*%)?/i),
    cess: amountAfter(lines, /\bcess\b(?:\s*@?\s*[\d.]+\s*%)?/i),
    roundOff: amountAfter(lines, /\b(round(?:ing|ed)?\s*(?:off|of)|r\/off)\b/i, { allowNegative: true }),
  };

  // Items, charges and the GST rate.
  const charges = parseCharges(lines);
  let items = parseItems(lines);
  const taxTotal = r2(tb.cgst + tb.sgst + tb.igst);
  const base = tb.taxableValue + charges.reduce((t, c) => t + c.amount, 0) * (tb.taxableValue && Math.abs(items.reduce((t, i) => t + i.amount, 0) - tb.taxableValue) < 1 ? 1 : 0);
  let taxRate = null;
  if (taxTotal > 0 && base > 0) {
    const r = (taxTotal / base) * 100;
    const near = STD_RATES.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a), 0);
    if (Math.abs(near - r) < 0.3) taxRate = near;
  }
  items = items.map((it) => {
    const m = bestMatch(it.name, catalog, 'name', 0.6);
    return {
      name: m ? m.item.name : it.name,
      billName: it.name,
      hsn: it.hsn || (m && m.item.hsn) || '',
      quantity: it.quantity,
      unit: it.unit,
      rate: it.rate,
      amount: it.amount,
      taxPercent: it.taxPercent ?? (m && m.item.taxPercent != null && m.item.taxPercent !== '' ? Number(m.item.taxPercent) : null) ?? taxRate ?? 0,
      ...(m ? { _matchedProductId: m.item.id, _matchedName: m.item.name, _matchScore: r2(m.score) } : {}),
    };
  });
  // Charges become their own line at the bill's GST rate.
  const chargeItems = charges.map((c) => ({ name: chargeName(c.label), billName: c.label, hsn: '', quantity: 1, unit: '', rate: c.amount, amount: c.amount, taxPercent: taxRate ?? (items[0]?.taxPercent || 0), charge: true }));

  // Self-check: do the bill's own figures agree?
  const checks = [];
  const itemsTotal = r2(items.reduce((t, i) => t + i.amount, 0));
  const allLines = [...items, ...chargeItems];
  if (items.length && tb.taxableValue) checks.push({ ok: Math.abs(itemsTotal - tb.taxableValue) < 1, text: `Items add up to ${itemsTotal.toFixed(2)}; the bill's taxable / basic amount is ${tb.taxableValue.toFixed(2)}` });
  if (taxTotal && allLines.length) {
    const tax = r2(allLines.reduce((t, i) => t + i.amount * (Number(i.taxPercent) || 0) / 100, 0));
    checks.push({ ok: Math.abs(tax - taxTotal) < 1, text: `GST on the lines comes to ${tax.toFixed(2)}; the bill shows ${taxTotal.toFixed(2)}` });
  }
  if (grandTotal && allLines.length) {
    const sum = r2(allLines.reduce((t, i) => t + i.amount * (1 + (Number(i.taxPercent) || 0) / 100), 0) + tb.cess + tb.roundOff);
    checks.push({ ok: Math.abs(sum - grandTotal) < 1, text: `Lines + GST${tb.roundOff ? ' + round off' : ''} = ${sum.toFixed(2)}; the bill's grand total is ${grandTotal.toFixed(2)}` });
  }
  if (!items.length) warnings.push('No item lines could be read: enter the items by hand (the totals above help you check them).');

  return {
    supplierName, supplierGstin, supplierAddress: matchedSupplier?.address || '', matchedSupplier: matchedSupplier ? { id: matchedSupplier.id, name: matchedSupplier.name } : null,
    invoiceNumber, date, grandTotal, taxBreakdown: tb, items: allLines, charges, taxRate,
    interstate: tb.igst > 0 && !tb.cgst, applyRoundOff: Math.abs(tb.roundOff) > 0.004,
    checks, warnings, _rawText: text,
  };
}
