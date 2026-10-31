// Divtech Hisaab - sale types and purchase types: how each invoice or purchase
// bill is settled. Every sale and purchase carries one, picked on the form.
//
// payment 'cash'   - paid in cash on the spot: the invoice / bill is recorded
//                    as paid at once and the cash shows in the Cash book.
// payment 'credit' - debit (udhar): due until a receipt (sales) or payment
//                    (purchases) is recorded, by bank / UPI or cash.
// gst false        - (sales) the buyer is not GST-registered (retail).
// urd true         - (purchases) bought from an unregistered dealer: no input
//                    tax credit is taken on it.
// The lists are the user's own (Settings), stored in meta.json.
// Standalone (imports nothing): the forms, Settings and tests share it.

export const SALE_TYPES_KEY = 'saleTypes';
export const PURCHASE_TYPES_KEY = 'purchaseTypes';

export const DEFAULT_SALE_TYPES = [
  { id: 'cash', name: 'Cash', payment: 'cash', gst: false, note: 'Retail sale to a buyer without GST, paid in cash' },
  { id: 'retail-debit', name: 'Retail Debit', payment: 'credit', gst: false, note: 'Buyer without GST, pays later by bank / UPI' },
  { id: 'debit', name: 'Debit', payment: 'credit', gst: true, note: 'GST-registered party, pays later by bank / UPI' },
];
export const DEFAULT_PURCHASE_TYPES = [
  { id: 'cash', name: 'Cash', payment: 'cash', urd: false, note: 'Paid in cash when bought' },
  { id: 'debit', name: 'Debit', payment: 'credit', urd: false, note: 'Payable until a payment is recorded' },
  { id: 'urd', name: 'URD', payment: 'credit', urd: true, note: 'Unregistered dealer: no input tax credit' },
];

export const newTypeId = () => `typ_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// A clean type, or null when it has no name.
export function cleanType(t, kind = 'sale') {
  const name = String(t?.name || '').trim().slice(0, 30);
  if (!name) return null;
  const out = {
    id: String(t.id || '').trim() || newTypeId(),
    name,
    payment: t.payment === 'cash' ? 'cash' : 'credit',
    note: String(t.note || '').trim().slice(0, 80),
    archived: !!t.archived,
  };
  if (kind === 'sale') out.gst = t.gst !== false;
  else out.urd = !!t.urd;
  if (t.isDefault) out.isDefault = true;
  return out;
}

// The saved list, or the defaults when nothing is saved yet.
export function typesList(saved, kind = 'sale') {
  const defaults = kind === 'sale' ? DEFAULT_SALE_TYPES : DEFAULT_PURCHASE_TYPES;
  const list = (Array.isArray(saved) ? saved : []).map((t) => cleanType(t, kind)).filter(Boolean);
  return list.length ? list : defaults.map((t) => cleanType(t, kind));
}

// Why a type cannot be saved, or ''.
export function typeProblem(t, others = []) {
  const name = String(t?.name || '').trim();
  if (!name) return 'Give the type a name, such as Cash or Debit.';
  if (name.length > 30) return 'Keep the name under 30 letters.';
  if (others.some((o) => o.id !== t.id && o.name.trim().toLowerCase() === name.toLowerCase())) return `There is already a type called ${name}.`;
  return '';
}

export const activeTypes = (list) => (list || []).filter((t) => !t.archived);
export const defaultType = (list) => { const a = activeTypes(list); return a.find((t) => t.isDefault) || null; };

// What is stored on the invoice / purchase: enough to read it without the list.
export const typeRef = (t, kind = 'sale') => (t
  ? { id: t.id, name: t.name, payment: t.payment, ...(kind === 'sale' ? { gst: t.gst !== false } : { urd: !!t.urd }) }
  : null);

export const isCashType = (t) => t?.payment === 'cash';
// A sale on credit: it is settled by recording a receipt, not by "Mark paid".
export const needsReceipt = (bill) => bill?.data?.details?.saleType?.payment === 'credit';
export const saleTypeOf = (bill) => bill?.data?.details?.saleType || null;
