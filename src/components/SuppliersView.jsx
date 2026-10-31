// Divtech Hisaab - Suppliers (the purchase master): the parties you buy from,
// with GSTIN, registration (regular, composition or unregistered / URD) and
// contact details, what you bought from each, paid and still owe (opening
// balance included), and a button to their ledger. Suppliers you have bought
// from but not saved are listed too, with a Save button.
import { useEffect, useMemo, useState } from 'react';
import { Truck, Plus, Upload, Search, X, Edit3, Trash2, BookOpen, Wallet, Save } from 'lucide-react';
import { getAllSuppliers, saveSupplier, deleteSupplier, getAllPurchases, getProfile } from '../store';
import { belongsToProfile, formatCurrency, getStatesForCountry, decodeGstin } from '../utils';
import { openLedger } from '../utils/openLedger';
import { purchaseTotal, purchasePaid, purchaseBalance } from '../utils/purchasePayments';
import { openingFor, openingDue, partyKey } from '../utils/openingBalances';
import { clientsCsvToList, CLIENTS_SAMPLE } from '../utils/listCsv';
import CsvListImport from './CsvListImport';
import OpeningBalances, { useOpeningBalances } from './OpeningBalances';
import HelpButton from './HelpButton';
import { toast } from './Toast';
import { confirmAction } from './ConfirmModal';

export const SUPPLIER_REGISTRATION = { regular: 'Regular (GST)', composition: 'Composition', urd: 'Unregistered (URD)' };
const blank = { name: '', gstin: '', registration: 'regular', phone: '', email: '', address: '', city: '', state: '', pin: '', note: '' };

// Opens a ledger on the Ledgers screen.
export { openLedger };

export default function SuppliersView() {
  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null);
  const [warning, setWarning] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showOpenings, setShowOpenings] = useState(false);
  const openings = useOpeningBalances();
  const states = getStatesForCountry('India');

  const load = async () => {
    try {
      const [sup, pur, prof] = await Promise.all([getAllSuppliers(), getAllPurchases().catch(() => []), getProfile().catch(() => null)]);
      setSuppliers(sup || []);
      setPurchases((pur || []).filter((p) => (p.kind || 'bill') !== 'po' && belongsToProfile(p, prof)));
    } catch {
      toast('Could not load suppliers', 'error');
    }
  };
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, []);

  // One row per supplier: saved ones and names only seen on purchase bills.
  const rows = useMemo(() => {
    const map = new Map();
    for (const s of suppliers) map.set(partyKey(s.name), { name: s.name, saved: s, bills: [] });
    for (const p of purchases) {
      const k = partyKey(p.supplierName);
      if (!k) continue;
      if (!map.has(k)) map.set(k, { name: String(p.supplierName).trim(), saved: null, bills: [], gstin: p.supplierGstin || '' });
      map.get(k).bills.push(p);
    }
    for (const o of openings) if (o.party === 'supplier' && !map.has(partyKey(o.name))) map.set(partyKey(o.name), { name: o.name, saved: null, bills: [] });
    return [...map.values()].map((r) => {
      const ob = openingFor(openings, 'supplier', r.name);
      const obDue = ob ? openingDue(ob) : 0;
      const total = r.bills.reduce((s, p) => s + purchaseTotal(p), 0);
      const paid = r.bills.reduce((s, p) => s + purchasePaid(p), 0);
      const owed = r.bills.reduce((s, p) => s + purchaseBalance(p), 0) + obDue;
      return { ...r, total, paid, owed, opening: ob };
    }).sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
  }, [suppliers, purchases, openings]);

  const q = search.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || String(r.saved?.gstin || r.gstin || '').toLowerCase().includes(q)) : rows;
  const totalOwed = rows.reduce((s, r) => s + Math.max(0, r.owed), 0);

  const openAdd = (prefill = {}) => { setWarning(''); setForm({ ...blank, ...prefill }); };
  const openEdit = (s) => { setWarning(''); setForm({ ...blank, ...s }); };
  const gstinBlur = () => {
    const d = decodeGstin(form.gstin);
    if (!form.gstin.trim()) return;
    if (!d) { setWarning('This GSTIN does not look right.'); return; }
    if (!d.checksumOk) { setWarning('This GSTIN fails its own checksum - check for a typo.'); return; }
    setWarning('');
    if (d.state && !form.state) setForm((f) => ({ ...f, state: d.state }));
    if (form.registration === 'urd') setForm((f) => ({ ...f, registration: 'regular' }));
  };
  const submit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) { setWarning('Enter the supplier name.'); return; }
    const dup = suppliers.find((s) => s.id !== form.id && partyKey(s.name) === partyKey(name));
    if (dup) { setWarning(`${dup.name} is already saved. Edit that one instead.`); return; }
    if (form.registration !== 'urd' && !form.gstin.trim() && !(await confirmAction({
      title: 'No GSTIN?', message: 'A registered supplier has a GSTIN, and it is needed for input tax credit. Save without it, or choose Unregistered (URD)?', confirmLabel: 'Save anyway', tone: 'warning',
    }))) return;
    try {
      await saveSupplier({ ...form, name });
      toast(form.id ? 'Supplier saved' : `${name} added`, 'success');
      setForm(null);
      load();
    } catch (err) { setWarning(err.message || 'Could not save'); }
  };
  const remove = async (s) => {
    if (!(await confirmAction({ title: `Remove ${s.name}?`, message: 'Only the saved details go. Purchase bills, payments and their ledger stay.', confirmLabel: 'Remove', tone: 'danger' }))) return;
    await deleteSupplier(s.id);
    toast('Supplier removed', 'success');
    load();
  };

  const label = { display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 };
  const num = { textAlign: 'right', whiteSpace: 'nowrap' };

  return (
    <div className="dashboard-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Suppliers <HelpButton title="Suppliers" doc="purchases#suppliers" size={16} /></h1>
          <p className="page-subtitle">Who you buy from, and what you owe each one</p>
        </div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setShowOpenings(true)}><Wallet size={16} /> Opening balances</button>
          <button type="button" className="btn btn-secondary" onClick={() => setShowImport(true)}><Upload size={16} /> Import CSV</button>
          <button type="button" className="btn btn-primary" onClick={() => openAdd()}><Plus size={18} /> Add supplier</button>
        </div>
      </div>

      {showOpenings && <OpeningBalances initialParty="supplier" onClose={() => { setShowOpenings(false); load(); }} />}
      {showImport && (
        <CsvListImport what="suppliers" sample={CLIENTS_SAMPLE.replace(/Demo Traders/, 'Demo Oil Mills').replace(/Sample Studio/, 'Sample Packers')} sampleName="Suppliers-sample.csv" doc="purchases#suppliers"
          intro="One supplier per row: Name (required), GSTIN, Phone, Email, Address and State."
          parse={(text) => { const r = clientsCsvToList(text, suppliers); return { list: r.clients.map((c) => ({ ...c, registration: c.gstin ? 'regular' : 'urd' })), skipped: r.skipped, errors: r.errors }; }}
          save={saveSupplier} onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); load(); }} />
      )}

      {form && (
        <div className="modal-overlay" onClick={() => setForm(null)}>
          <form className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="section-title" style={{ margin: 0 }}>{form.id ? 'Edit supplier' : 'Add supplier'}</h3>
              <button type="button" className="icon-btn" onClick={() => setForm(null)} aria-label="Close"><X size={18} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={label} htmlFor="sup-name">Supplier name *</label>
                <input id="sup-name" className="form-input" value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="As on their bills" />
              </div>
              <div>
                <label style={label} htmlFor="sup-reg">Registration</label>
                <select id="sup-reg" className="form-input" value={form.registration} onChange={(e) => setForm({ ...form, registration: e.target.value })}>
                  {Object.entries(SUPPLIER_REGISTRATION).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={label} htmlFor="sup-gstin">GSTIN</label>
                <input id="sup-gstin" className="form-input" value={form.gstin} maxLength={15} disabled={form.registration === 'urd'}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} onBlur={gstinBlur} placeholder={form.registration === 'urd' ? 'Not registered' : '15-digit GSTIN'} />
              </div>
              <div>
                <label style={label} htmlFor="sup-phone">Phone</label>
                <input id="sup-phone" className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label style={label} htmlFor="sup-email">Email</label>
                <input id="sup-email" className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={label} htmlFor="sup-addr">Address</label>
                <input id="sup-addr" className="form-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div>
                <label style={label} htmlFor="sup-city">City</label>
                <input id="sup-city" className="form-input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <label style={label} htmlFor="sup-state">State</label>
                <select id="sup-state" className="form-input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
                  <option value="">Select state</option>
                  {states.map((st) => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={label} htmlFor="sup-note">Note</label>
                <input id="sup-note" className="form-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. credit 30 days" />
              </div>
            </div>
            {warning && <p role="alert" style={{ color: '#d97706', fontSize: '0.82rem', margin: '0.6rem 0 0' }}>{warning}</p>}
            <div className="flex gap-2 justify-end mt-4">
              <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary"><Save size={16} /> Save supplier</button>
            </div>
          </form>
        </div>
      )}

      <div className="glass-panel p-4 mb-6" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="search-box" style={{ maxWidth: 400, flex: '1 1 260px' }}>
          <Search size={16} className="search-icon" />
          <input type="text" placeholder="Search suppliers or GSTIN..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
          {search && <button type="button" className="icon-btn" onClick={() => setSearch('')} aria-label="Clear"><X size={14} /></button>}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: '0.9rem' }}>
          {rows.length} supplier{rows.length === 1 ? '' : 's'} · you owe <strong style={{ color: totalOwed > 0.005 ? '#dc2626' : undefined }}>{formatCurrency(totalOwed)}</strong>
        </span>
      </div>

      {shown.length === 0 ? (
        <div className="glass-panel p-6"><div className="empty-state"><Truck size={48} /><p>{rows.length ? 'No supplier matches.' : 'No suppliers yet. Add one, or they appear here from your purchase bills.'}</p></div></div>
      ) : (
        <div className="glass-panel">
          <div className="table-scroll">
            <table className="data-table" style={{ minWidth: 760 }}>
              <thead>
                <tr><th>Supplier</th><th>GSTIN</th><th style={num}>Purchases</th><th style={num}>Paid</th><th style={num}>You owe</th><th className="col-center">Actions</th></tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.name}>
                    <td style={{ whiteSpace: 'normal' }}>
                      <span className="font-medium">{r.name}</span>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {r.saved ? [SUPPLIER_REGISTRATION[r.saved.registration], r.saved.city || r.saved.state, r.saved.phone].filter(Boolean).join(' · ') : 'Not saved yet'}
                        {r.opening ? ' · opening balance' : ''}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '0.78rem' }}>{r.saved?.gstin || r.gstin || '—'}</td>
                    <td style={num}>{formatCurrency(r.total)}</td>
                    <td style={{ ...num, color: '#059669' }}>{formatCurrency(r.paid)}</td>
                    <td style={{ ...num, fontWeight: 700, color: r.owed > 0.005 ? '#dc2626' : r.owed < -0.005 ? '#0369a1' : '#059669' }}>
                      {r.owed < -0.005 ? `${formatCurrency(-r.owed)} adv.` : formatCurrency(r.owed)}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button type="button" className="icon-btn icon-btn-blue" title="Ledger" aria-label={`Ledger of ${r.name}`} onClick={() => openLedger(`supplier:${r.name}`)}><BookOpen size={15} /></button>
                        {r.saved ? (
                          <>
                            <button type="button" className="icon-btn" title="Edit" aria-label={`Edit ${r.name}`} onClick={() => openEdit(r.saved)}><Edit3 size={15} /></button>
                            <button type="button" className="icon-btn icon-btn-red" title="Remove" aria-label={`Remove ${r.name}`} onClick={() => remove(r.saved)}><Trash2 size={15} /></button>
                          </>
                        ) : (
                          <button type="button" className="icon-btn" title="Save as a supplier" aria-label={`Save ${r.name}`}
                            onClick={() => openAdd({ name: r.name, gstin: r.gstin || '', registration: r.gstin ? 'regular' : 'urd', state: decodeGstin(r.gstin || '')?.state || '' })}><Plus size={15} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
