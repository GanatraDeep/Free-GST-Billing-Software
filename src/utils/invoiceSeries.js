// Divtech Hisaab - invoice series: the business's own numbering series for tax
// invoices, such as A (retail, cash), AB (retail, credit) and BB (dealers,
// credit). Each series has its own prefix, format and running number, and is
// picked on each invoice. The list is the user's own: add, edit, archive.
// Standalone (imports nothing): the editor, Settings and tests share it.
//
// A series: { id, name, prefix, separator: '/' | '-' | '', showFinYear,
//   fyStyle: 'full' | 'short', padDigits: 0-6, resetYearly, isDefault,
//   archived, business: businessKey ('' = every business) }

export const SERIES_META_KEY = 'invoiceSeries';
// GST rule 46: at most 16 characters, letters, digits, "-" and "/".
const GST_DOC_NUMBER = /^[A-Za-z0-9\-/]{1,16}$/;
// Prefixes the app already prints for other documents (utils DOC_TYPE_PREFIXES).
const TAKEN = ['INV', 'QUO', 'EST', 'BOS', 'COMP', 'CN', 'DC', 'RCP'];

export const SERIES_DEFAULTS = {
  name: '', prefix: '', separator: '/', showFinYear: true, fyStyle: 'short', padDigits: 4,
  resetYearly: true, isDefault: false, archived: false, business: '',
};

export const newSeriesId = () => `ser_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// The series a business can use (its own and the shared ones), in list order.
export const seriesForBusiness = (list, businessKey, { includeArchived = false } = {}) =>
  (Array.isArray(list) ? list : [])
    .filter((s) => s && (!s.business || s.business === businessKey))
    .filter((s) => includeArchived || !s.archived);

// The series new invoices start with: the one marked default, else the first.
export const defaultSeries = (list) => list.find((s) => s.isDefault) || list[0] || null;

// "2026-27" or "26-27".
const fyText = (series, fyLabel) => (series.fyStyle === 'short' ? String(fyLabel || '').replace(/^\d\d(?=\d\d-)/, '') : String(fyLabel || ''));

// The meta.json counter this series counts in. Yearly series count afresh in
// each financial year.
export const seriesCounterKey = (series, fyLabel) =>
  `counter_SER_${series.id}${series.resetYearly ? `@${fyLabel}` : ''}`;

export const formatSeriesNumber = (series, next, fyLabel) => {
  const s = { ...SERIES_DEFAULTS, ...series };
  const sep = ['/', '-', ''].includes(s.separator) ? s.separator : '/';
  const n = String(Math.max(1, Math.floor(Number(next) || 1))).padStart(Math.min(6, Math.max(0, Number(s.padDigits) || 0)), '0');
  const fy = s.showFinYear ? fyText(s, fyLabel) : '';
  return [String(s.prefix).trim(), fy, n].filter(Boolean).join(sep);
};

// Why this series cannot be saved, or ''. `others`: the business's other series.
export function seriesProblem(series, others = [], { brandPrefix = '', fyLabel = '2026-27' } = {}) {
  const s = { ...SERIES_DEFAULTS, ...series };
  const name = String(s.name || '').trim();
  const prefix = String(s.prefix || '').trim();
  if (!name) return 'Give the series a name, such as Retail cash.';
  if (name.length > 40) return 'Keep the name under 40 letters.';
  if (!prefix) return 'Enter a prefix, such as A.';
  if (!/^[A-Za-z0-9]{1,8}$/.test(prefix)) return 'The prefix can have only letters and digits (up to 8), such as A, AB or BB.';
  if (s.separator === '' && /\d$/.test(prefix)) return 'With no separator the prefix must end in a letter (A1 is fine, A11 would be unclear).';
  const up = prefix.toUpperCase();
  if (TAKEN.includes(up)) return `${up} is used by the app for other documents. Choose another prefix.`;
  if (up === String(brandPrefix || '').trim().toUpperCase()) return `${up} is your standard invoice prefix. Choose another.`;
  const clash = others.find((o) => o.id !== s.id && String(o.prefix || '').trim().toUpperCase() === up);
  if (clash) return `${up} is already the prefix of ${clash.name}.`;
  const nameClash = others.find((o) => o.id !== s.id && String(o.name || '').trim().toLowerCase() === name.toLowerCase());
  if (nameClash) return `There is already a series called ${nameClash.name}.`;
  const sample = formatSeriesNumber(s, 999999, fyLabel);
  if (!GST_DOC_NUMBER.test(sample)) {
    return `Numbers would look like ${sample}: ${sample.length} characters, but the GST portal allows 16. Use a shorter prefix, the short year, or fewer digits.`;
  }
  return '';
}

// Only the known fields, tidied.
export const cleanSeries = (series) => {
  const s = { ...SERIES_DEFAULTS, ...series };
  return {
    id: String(s.id || newSeriesId()),
    name: String(s.name).trim().replace(/\s+/g, ' '),
    prefix: String(s.prefix).trim(),
    separator: ['/', '-', ''].includes(s.separator) ? s.separator : '/',
    showFinYear: !!s.showFinYear,
    fyStyle: s.fyStyle === 'full' ? 'full' : 'short',
    padDigits: Math.min(6, Math.max(0, Math.floor(Number(s.padDigits) || 0))),
    resetYearly: !!s.resetYearly,
    isDefault: !!s.isDefault,
    archived: !!s.archived,
    business: String(s.business || ''),
  };
};

// The series a saved invoice belongs to, from its stored id or, for older
// invoices, from its number's prefix.
export const seriesOfBill = (bill, list) => {
  const id = bill?.data?.details?.seriesId;
  if (id) return (list || []).find((s) => s.id === id) || null;
  const num = String(bill?.invoiceNumber || '');
  return (list || []).find((s) => {
    const p = String(s.prefix || '');
    if (!p || !num.toUpperCase().startsWith(p.toUpperCase())) return false;
    const rest = num.slice(p.length);
    return s.separator ? rest.startsWith(s.separator) : /^\d/.test(rest);
  }) || null;
};
