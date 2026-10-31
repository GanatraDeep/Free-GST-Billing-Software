// Divtech Hisaab - Settings > Sale types / Purchase types. Cash, Retail Debit
// and Debit for sales; Cash, Debit and URD for purchases, to start with. The
// user can rename them, add more, choose the one new forms start on, and hide
// ones not used. Rules: utils/docTypes.js.
import { useEffect, useState } from 'react';
import { Plus, Save, Archive, RotateCcw, Star } from 'lucide-react';
import { getDocTypes, saveDocTypes } from '../store';
import { cleanType, typeProblem, newTypeId } from '../utils/docTypes';
import { toast } from './Toast';
import HelpButton from './HelpButton';

export const DOC_TYPES_EVENT = 'divtech-doc-types-changed';

const TEXT = {
  sale: {
    title: 'Sale types', doc: 'invoices#sale-types',
    intro: 'Picked on each invoice. Cash: the invoice is paid in cash on the spot and shows in the Cash book. Debit (on credit): the invoice stays due until you record a receipt, by bank / UPI or cash.',
    flag: 'GST party', flagHelp: 'The buyer is GST-registered (for your reference; GST on the invoice works as usual)',
  },
  purchase: {
    title: 'Purchase types', doc: 'purchases#purchase-types',
    intro: 'Picked on each purchase bill. Cash: paid in cash when bought. Debit: payable until you record a payment. URD (unregistered dealer): no input tax credit is taken on the bill.',
    flag: 'URD (no ITC)', flagHelp: 'Bought from an unregistered dealer: the GST on it is not claimed as input tax credit',
  },
};

export default function DocTypesSettings({ kind = 'sale' }) {
  const T = TEXT[kind];
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let live = true;
    getDocTypes(kind).then((l) => { if (live) setList(l); }).catch(() => toast(`Could not load ${T.title.toLowerCase()}`, 'error'));
    return () => { live = false; };
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (id, patch) => {
    setDirty(true);
    setList((l) => l.map((t) => {
      if (patch.isDefault) return t.id === id ? { ...t, ...patch } : { ...t, isDefault: false };
      return t.id === id ? { ...t, ...patch } : t;
    }));
  };
  const add = () => {
    setDirty(true);
    setList((l) => [...l, { id: newTypeId(), name: '', payment: 'credit', note: '', ...(kind === 'sale' ? { gst: true } : { urd: false }) }]);
  };

  const save = async () => {
    const named = list.filter((t) => String(t.name || '').trim());
    for (const t of named) {
      const problem = typeProblem(t, named);
      if (problem) { toast(problem, 'error'); return; }
    }
    if (!named.some((t) => !t.archived)) { toast('Keep at least one type in use.', 'error'); return; }
    setBusy(true);
    try {
      const clean = named.map((t) => cleanType(t, kind)).filter(Boolean);
      await saveDocTypes(kind, clean);
      setList(clean);
      setDirty(false);
      window.dispatchEvent(new Event(DOC_TYPES_EVENT));
      toast(`${T.title} saved`, 'success');
    } catch {
      toast(`Could not save ${T.title.toLowerCase()}`, 'error');
    } finally { setBusy(false); }
  };

  const flagKey = kind === 'sale' ? 'gst' : 'urd';
  return (
    <div className="glass-panel p-6 mb-6" id={`section-${kind}-types`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}>
        <h3 className="section-title" style={{ margin: 0 }}>{T.title}</h3>
        <HelpButton title={T.title} doc={T.doc} size={16} />
      </div>
      <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>{T.intro}</p>
      <div className="table-scroll">
        <table className="data-table" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Payment</th>
              <th title={T.flagHelp}>{T.flag}</th>
              <th>Note</th>
              <th className="col-center">Default</th>
              <th className="col-center">In use</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id} style={t.archived ? { opacity: 0.55 } : undefined}>
                <td><input className="form-input" value={t.name} maxLength={30} placeholder="Type name" aria-label="Type name"
                  onChange={(e) => change(t.id, { name: e.target.value })} /></td>
                <td>
                  <select className="form-input" value={t.payment} aria-label="Payment" onChange={(e) => change(t.id, { payment: e.target.value })}>
                    <option value="cash">Cash, paid at once</option>
                    <option value="credit">Debit, paid later</option>
                  </select>
                </td>
                <td className="col-center">
                  <input type="checkbox" checked={kind === 'sale' ? t.gst !== false : !!t.urd} title={T.flagHelp} aria-label={T.flag}
                    onChange={(e) => change(t.id, { [flagKey]: e.target.checked })} />
                </td>
                <td><input className="form-input" value={t.note || ''} maxLength={80} placeholder="Optional" aria-label="Note"
                  onChange={(e) => change(t.id, { note: e.target.value })} /></td>
                <td className="col-center">
                  <button type="button" className={`icon-btn ${t.isDefault ? 'icon-btn-blue' : ''}`} title={t.isDefault ? 'New forms start on this type' : 'Start new forms on this type'}
                    aria-label="Default" onClick={() => change(t.id, { isDefault: !t.isDefault })}>
                    <Star size={15} fill={t.isDefault ? 'currentColor' : 'none'} />
                  </button>
                </td>
                <td className="col-center">
                  <button type="button" className="icon-btn" title={t.archived ? 'Use again' : 'Hide from the forms (old bills keep it)'}
                    aria-label={t.archived ? 'Use again' : 'Hide'} onClick={() => change(t.id, { archived: !t.archived, ...(t.archived ? {} : { isDefault: false }) })}>
                    {t.archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" onClick={add}><Plus size={16} /> Add a type</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !dirty}><Save size={16} /> Save {T.title.toLowerCase()}</button>
      </div>
      <p className="text-muted" style={{ fontSize: '0.78rem', marginBottom: 0 }}>
        With no default, every new {kind === 'sale' ? 'invoice' : 'purchase bill'} asks you to pick a type. Changing a type here does not change bills already saved.
      </p>
    </div>
  );
}
