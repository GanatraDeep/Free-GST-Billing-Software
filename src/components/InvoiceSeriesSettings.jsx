// Divtech Hisaab - Settings > Invoice series: the business's own tax-invoice
// series (e.g. A retail cash, AB retail credit, BB dealer credit). Add, edit,
// make one the default, set where numbering continues, archive. Each series
// counts on its own; on the invoice you pick which one it is in.
// Rules: utils/invoiceSeries.js (unit-tested).
import { useEffect, useState } from 'react';
import { Plus, Save, Edit3, Archive, RotateCcw, X, Trash2, Star } from 'lucide-react';
import { getInvoiceSeries, saveInvoiceSeries, peekSeriesNext, setSeriesNextNumber, getInvoiceNumberSettings } from '../store';
import { businessKeyOf, getFinancialYearLabel } from '../utils';
import { seriesForBusiness, seriesProblem, cleanSeries, formatSeriesNumber, newSeriesId, SERIES_DEFAULTS } from '../utils/invoiceSeries';
import { toast } from './Toast';
import { confirmAction } from './ConfirmModal';
import HelpButton from './HelpButton';

export const SERIES_EVENT = 'divtech-series-changed';

const blank = () => ({ ...SERIES_DEFAULTS, id: '', nextNumber: '1' });

export default function InvoiceSeriesSettings({ profile }) {
  const bizKey = businessKeyOf(profile);
  const fyLabel = getFinancialYearLabel(new Date());
  const [all, setAll] = useState([]);
  const [nextNo, setNextNo] = useState({}); // id -> next number this year
  const [brandPrefix, setBrandPrefix] = useState('');
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const mine = seriesForBusiness(all, bizKey, { includeArchived: true });

  const loadNext = async (list) => {
    const pairs = await Promise.all(list.map(async (s) => [s.id, await peekSeriesNext(s).catch(() => 1)]));
    setNextNo(Object.fromEntries(pairs));
  };
  useEffect(() => {
    let live = true;
    Promise.all([getInvoiceSeries(), getInvoiceNumberSettings().catch(() => ({}))])
      .then(([list, ns]) => { if (!live) return; setAll(list); setBrandPrefix(ns?.brandPrefix || ''); loadNext(list); })
      .catch(() => toast('Could not load invoice series', 'error'));
    return () => { live = false; };
  }, []);

  // Re-read before writing, so another open tab's changes are not lost.
  const update = async (change, done) => {
    setBusy(true);
    try {
      const next = change(await getInvoiceSeries());
      await saveInvoiceSeries(next);
      setAll(next);
      window.dispatchEvent(new Event(SERIES_EVENT));
      if (done) toast(done, 'success');
      return next;
    } catch {
      toast('Could not save invoice series', 'error');
      return null;
    } finally { setBusy(false); }
  };

  const openAdd = () => { setError(''); setForm(blank()); };
  const openEdit = (s) => { setError(''); setForm({ ...s, nextNumber: String(nextNo[s.id] || 1) }); };

  const submit = async (e) => {
    e.preventDefault();
    const others = seriesForBusiness(all, bizKey, { includeArchived: true });
    const draft = cleanSeries({ ...form, id: form.id || newSeriesId(), business: form.id ? form.business : bizKey });
    const problem = seriesProblem(draft, others, { brandPrefix, fyLabel });
    if (problem) { setError(problem); return; }
    const want = Math.floor(Number(form.nextNumber));
    if (!Number.isInteger(want) || want < 1 || want > 999999) { setError('Next number must be a whole number from 1.'); return; }
    const current = form.id ? (nextNo[form.id] || 1) : 1;
    if (form.id && want < current && !(await confirmAction({
      title: `Go back to ${formatSeriesNumber(draft, want, fyLabel)}?`,
      message: `This series has already reached ${formatSeriesNumber(draft, current, fyLabel)}. Going back can give a number that already exists; the app then skips to the next free one.`,
      confirmLabel: 'Go back', tone: 'warning',
    }))) return;
    const firstOne = others.filter((o) => !o.archived).length === 0;
    const saved = await update((list) => {
      let next = form.id ? list.map((x) => (x.id === draft.id ? draft : x)) : [...list, { ...draft, isDefault: draft.isDefault || firstOne }];
      if (draft.isDefault) next = next.map((x) => (x.id !== draft.id && (!x.business || x.business === bizKey) ? { ...x, isDefault: false } : x));
      return next;
    }, form.id ? 'Series saved' : `Series ${draft.prefix} added`);
    if (!saved) return;
    if (want !== current) await setSeriesNextNumber(draft, want).catch(() => toast('The next number could not be set', 'error'));
    await loadNext(saved);
    setForm(null);
  };

  const makeDefault = (s) => update((list) => list.map((x) => (
    (!x.business || x.business === bizKey) ? { ...x, isDefault: x.id === s.id } : x)), `New invoices start in ${s.name}`);
  const setArchived = (s, archived) => update((list) => list.map((x) => (x.id === s.id ? { ...x, archived, isDefault: archived ? false : x.isDefault } : x)),
    archived ? `${s.name} archived. Its invoices keep their numbers.` : `${s.name} is active again`);
  const remove = async (s) => {
    if (!(await confirmAction({ title: `Delete ${s.name}?`, message: 'It has not been used yet, so nothing else changes.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    await update((list) => list.filter((x) => x.id !== s.id), `${s.name} deleted`);
  };

  const preview = form ? formatSeriesNumber({ ...form, prefix: form.prefix || 'A' }, Number(form.nextNumber) || 1, fyLabel) : '';
  const label = { display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 };

  return (
    <div className="glass-panel p-6 mb-6">
      <h3 className="section-title" style={{ marginTop: 0, marginBottom: '0.25rem' }}>
        Invoice series <HelpButton title="Invoice series" doc="settings#invoice-series" size={16} style={{ marginLeft: 6 }} />
      </h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1rem', maxWidth: '75ch' }}>
        Separate numbering for different kinds of tax invoice{profile?.businessName ? ` of ${profile.businessName}` : ''}, for example
        <b> A</b> retail cash, <b>AB</b> retail credit and <b>BB</b> dealer credit. Each series counts on its own; pick one at the top of every invoice.
        With no series, invoices use the standard number format above.
      </p>

      {form ? (
        <form onSubmit={submit} className="surface-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={label} htmlFor="ser-name">Name</label>
              <input id="ser-name" className="form-input" value={form.name} maxLength={40} autoFocus
                onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Retail cash" />
            </div>
            <div>
              <label style={label} htmlFor="ser-prefix">Prefix</label>
              <input id="ser-prefix" className="form-input" value={form.prefix} maxLength={8}
                onChange={(e) => setForm({ ...form, prefix: e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase() })} placeholder="e.g. A" />
            </div>
            <div>
              <label style={label} htmlFor="ser-sep">Separator</label>
              <select id="ser-sep" className="form-input" value={form.separator} onChange={(e) => setForm({ ...form, separator: e.target.value })}>
                <option value="/">/ (A/0001)</option>
                <option value="-">- (A-0001)</option>
                <option value="">None (A0001)</option>
              </select>
            </div>
            <div>
              <label style={label} htmlFor="ser-year">Year in number</label>
              <select id="ser-year" className="form-input" value={form.showFinYear ? form.fyStyle : 'none'}
                onChange={(e) => setForm({ ...form, showFinYear: e.target.value !== 'none', fyStyle: e.target.value === 'none' ? form.fyStyle : e.target.value })}>
                <option value="short">Short ({fyLabel.slice(2)})</option>
                <option value="full">Full ({fyLabel})</option>
                <option value="none">No year</option>
              </select>
            </div>
            <div>
              <label style={label} htmlFor="ser-pad">Digits</label>
              <select id="ser-pad" className="form-input" value={form.padDigits} onChange={(e) => setForm({ ...form, padDigits: Number(e.target.value) })}>
                <option value={0}>As is (1, 2 … 1546)</option>
                {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} ({'1'.padStart(n, '0')})</option>)}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="ser-next">Next number</label>
              <input id="ser-next" className="form-input" type="number" min="1" step="1" value={form.nextNumber}
                onChange={(e) => setForm({ ...form, nextNumber: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '0.75rem', fontSize: '0.85rem' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.resetYearly} onChange={(e) => setForm({ ...form, resetYearly: e.target.checked })} />
              Start again at 1 every 1 April
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
              New invoices start in this series
            </label>
          </div>
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem' }}>
            Next invoice: <b style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>{preview}</b>
            <span style={{ color: 'var(--text-muted)' }}> · To continue from your old software, set Next number to the number after its last bill.</span>
          </p>
          {error && <p role="alert" style={{ color: 'var(--danger, #dc2626)', fontSize: '0.82rem', margin: '0.5rem 0 0' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}><X size={16} /> Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}><Save size={16} /> {form.id ? 'Save series' : 'Add series'}</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-primary" style={{ marginBottom: '1rem' }} onClick={openAdd}><Plus size={16} /> Add a series</button>
      )}

      {mine.length === 0 ? (
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>No series yet: every tax invoice uses the standard numbering.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table" style={{ minWidth: 0 }}>
            <thead><tr><th>Series</th><th>Next invoice</th><th>Restarts</th><th className="col-center">Actions</th></tr></thead>
            <tbody>
              {mine.map((s) => {
                const used = (nextNo[s.id] || 1) > 1;
                return (
                  <tr key={s.id} style={s.archived ? { opacity: 0.6 } : undefined}>
                    <td className="font-medium" style={{ whiteSpace: 'normal' }}>
                      <span className="invoice-badge" style={{ marginRight: 8 }}>{s.prefix}</span>{s.name}
                      {s.isDefault && !s.archived && <span style={{ marginLeft: 8, fontSize: '0.72rem', color: 'var(--primary)' }}>default</span>}
                      {s.archived && <span style={{ marginLeft: 8, fontSize: '0.72rem', color: 'var(--text-muted)' }}>archived</span>}
                    </td>
                    <td style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>{formatSeriesNumber(s, nextNo[s.id] || 1, fyLabel)}</td>
                    <td>{s.resetYearly ? 'Every April' : 'Never'}</td>
                    <td>
                      <div className="table-actions">
                        {!s.archived && !s.isDefault && (
                          <button type="button" className="icon-btn" disabled={busy} title="Make default" aria-label={`Make ${s.name} the default`} onClick={() => makeDefault(s)}><Star size={15} /></button>
                        )}
                        <button type="button" className="icon-btn icon-btn-blue" disabled={busy} title="Edit" aria-label={`Edit ${s.name}`} onClick={() => openEdit(s)}><Edit3 size={15} /></button>
                        {s.archived ? (
                          <button type="button" className="icon-btn" disabled={busy} title="Restore" aria-label={`Restore ${s.name}`} onClick={() => setArchived(s, false)}><RotateCcw size={15} /></button>
                        ) : used ? (
                          <button type="button" className="icon-btn icon-btn-red" disabled={busy} title="Archive (stop using it)" aria-label={`Archive ${s.name}`} onClick={() => setArchived(s, true)}><Archive size={15} /></button>
                        ) : (
                          <button type="button" className="icon-btn icon-btn-red" disabled={busy} title="Delete" aria-label={`Delete ${s.name}`} onClick={() => remove(s)}><Trash2 size={15} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
