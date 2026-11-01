// Divtech Hisaab - adjust an item's stock after counting it: shortage,
// leakage, wastage or damage (stock out) and stock found in excess (in). Each
// adjustment is dated and kept, shows in the item ledger, and is valued at the
// average cost: a shortage is an expense in profit and loss, an excess an
// income (utils/ledgers.js). The product's stock changes with it.
import { useEffect, useState } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import { getAllStockAdjustments, saveStockAdjustment, deleteStockAdjustment, saveProduct, getAllProducts, getProfile } from '../store';
import { localToday, roundQty, belongsToProfile } from '../utils';
import { toast } from './Toast';
import { confirmAction } from './ConfirmModal';
import { confirmClosedYear } from './useClosedYears';
import HelpButton from './HelpButton';

export const ADJUST_REASONS = ['Shortage', 'Leakage', 'Wastage / damage', 'Used in the shop', 'Excess found', 'Other'];

// Saves an adjustment and moves the product's stock by `qty` (signed).
export async function recordStockAdjustment(product, { qty, date, reason, note }, profile) {
  const q = roundQty(Number(qty) || 0);
  if (!q) return null;
  const saved = await saveStockAdjustment({
    productId: product.id, productName: product.name, qty: q, date, reason, note,
    ownerGstin: profile?.gstin || '', ownerName: profile?.businessName || '',
  });
  const fresh = (await getAllProducts()).find((p) => p.id === product.id) || product;
  await saveProduct({ ...fresh, stock: roundQty((Number(fresh.stock) || 0) + q) });
  return saved;
}

export default function StockAdjustModal({ product, onClose, onDone }) {
  const [profile, setProfile] = useState(null);
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ mode: 'count', counted: '', qty: '', date: localToday(), reason: 'Shortage', note: '' });
  const [busy, setBusy] = useState(false);
  const stock = Number(product.stock) || 0;

  const load = () => Promise.all([getAllStockAdjustments().catch(() => []), getProfile().catch(() => null)]).then(([l, p]) => {
    setProfile(p);
    setList((l || []).filter((a) => a.productId === product.id && belongsToProfile(a, p)));
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const change = form.mode === 'count'
    ? (form.counted === '' ? 0 : roundQty(Number(form.counted) - stock))
    : roundQty((form.reason === 'Excess found' ? 1 : -1) * Math.abs(Number(form.qty) || 0));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!change) { toast('Nothing to adjust', 'info'); return; }
    if (!(await confirmClosedYear(form.date, profile))) return;
    setBusy(true);
    try {
      const reason = form.mode === 'count' && change > 0 && form.reason !== 'Other' ? 'Excess found' : form.reason;
      await recordStockAdjustment(product, { qty: change, date: form.date, reason, note: form.note.trim() }, profile);
      toast(`${product.name}: ${change > 0 ? '+' : ''}${change} ${product.unit || ''} (${reason})`, 'success');
      onDone?.();
      onClose();
    } catch (err) { toast(err.message || 'Could not save', 'error'); } finally { setBusy(false); }
  };
  const remove = async (a) => {
    if (!(await confirmAction({ title: 'Delete this adjustment?', message: `${a.qty > 0 ? '+' : ''}${a.qty} on ${a.date} (${a.reason}). The stock goes back by that much.`, confirmLabel: 'Delete', tone: 'danger' }))) return;
    if (!(await confirmClosedYear(a.date, profile))) return;
    await deleteStockAdjustment(a.id);
    const fresh = (await getAllProducts()).find((p) => p.id === product.id) || product;
    await saveProduct({ ...fresh, stock: roundQty((Number(fresh.stock) || 0) - a.qty) });
    toast('Adjustment deleted', 'success');
    onDone?.();
    onClose();
  };
  const label = { display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 };
  const muted = { color: 'var(--text-muted)', fontSize: '0.8rem' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-content" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="section-title" style={{ margin: 0 }}>Adjust stock: {product.name} <HelpButton title="Stock adjustments" doc="products#adjust-stock" size={15} /></h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <p style={muted}>In stock now: <strong>{stock} {product.unit || ''}</strong>. A shortage is counted at the average purchase cost as a loss (Stock shortage and wastage); an excess as income.</p>
        <div style={{ display: 'flex', gap: '0.4rem', margin: '0.5rem 0' }} role="group" aria-label="How">
          <button type="button" className={`btn ${form.mode === 'count' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setForm((f) => ({ ...f, mode: 'count' }))} style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}>I counted it</button>
          <button type="button" className={`btn ${form.mode === 'qty' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setForm((f) => ({ ...f, mode: 'qty' }))} style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}>Enter the quantity</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          {form.mode === 'count' ? (
            <div>
              <label style={label} htmlFor="adj-counted">Counted quantity</label>
              <input id="adj-counted" type="number" step="any" className="form-input" value={form.counted} onChange={set('counted')} placeholder={String(stock)} autoFocus />
            </div>
          ) : (
            <div>
              <label style={label} htmlFor="adj-qty">Quantity {form.reason === 'Excess found' ? 'found' : 'lost'}</label>
              <input id="adj-qty" type="number" min="0" step="any" className="form-input" value={form.qty} onChange={set('qty')} placeholder="0" autoFocus />
            </div>
          )}
          <div>
            <label style={label} htmlFor="adj-date">Date</label>
            <input id="adj-date" type="date" className="form-input" value={form.date} onChange={set('date')} />
          </div>
          <div>
            <label style={label} htmlFor="adj-reason">Reason</label>
            <select id="adj-reason" className="form-input" value={form.reason} onChange={set('reason')}>
              {ADJUST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="adj-note">Note</label>
            <input id="adj-note" className="form-input" value={form.note} onChange={set('note')} placeholder="Optional" />
          </div>
        </div>
        <p style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0.75rem 0 0', color: change < 0 ? 'var(--danger)' : change > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
          {change ? `Stock ${change > 0 ? 'up' : 'down'} by ${Math.abs(change)} ${product.unit || ''}: ${stock} → ${roundQty(stock + change)}` : 'No change'}
        </p>
        {list.length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ ...muted, fontWeight: 600 }}>Earlier adjustments</div>
            {list.slice(0, 8).map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.8rem', padding: '3px 0' }}>
                <span style={{ minWidth: 80 }}>{a.date}</span>
                <span style={{ minWidth: 60, color: a.qty < 0 ? 'var(--danger)' : 'var(--success)' }}>{a.qty > 0 ? '+' : ''}{a.qty}</span>
                <span style={{ flex: 1 }}>{a.reason}{a.note ? ` · ${a.note}` : ''}</span>
                <button type="button" className="icon-btn icon-btn-red" aria-label="Delete adjustment" onClick={() => remove(a)}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !change}><Save size={16} /> Save adjustment</button>
        </div>
      </form>
    </div>
  );
}
