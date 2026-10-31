// Divtech Hisaab - Opening balances: what each client owed you, and what you
// owed each supplier, on the day the books started in this app (carried over
// from Miracle or other software). Opened from Clients and from Purchases.
// Rules and CSV reading are in utils/openingBalances.js (unit-tested).
import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Upload, Download, Pencil, Trash2, Wallet } from 'lucide-react';
import { getAllOpeningBalances, saveOpeningBalance, deleteOpeningBalance, getAllClients, getAllPurchases, getProfile } from '../store';
import { belongsToProfile, formatCurrency, localToday } from '../utils';
import { PURCHASE_PAYMENT_MODES, purchasePaymentModeName } from '../utils/purchasePayments';
import {
  openingDue, openingPaid, validateOpening, openingFor, openingCsvToList, openingToCsv, partyKey, OPENING_SAMPLE,
} from '../utils/openingBalances';
import CsvListImport from './CsvListImport';
import HelpButton from './HelpButton';
import { toast } from './Toast';
import { confirmAction } from './ConfirmModal';

export const OPENING_EVENT = 'divtech-opening-changed';

const fmtDay = (d) => {
  const x = new Date(`${d}T00:00:00`);
  return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const dirLabel = (party, direction) => (party === 'client'
  ? (direction === 'owed' ? 'Owes you' : 'Advance from them')
  : (direction === 'owed' ? 'You owe them' : 'Advance paid to them'));
const download = (text, name) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Loads the active business's opening balances; reloads when they change.
export function useOpeningBalances() {
  const [list, setList] = useState([]);
  useEffect(() => {
    let live = true;
    const load = () => Promise.all([getAllOpeningBalances(), getProfile().catch(() => null)])
      .then(([rows, prof]) => { if (live) setList((rows || []).filter((o) => belongsToProfile(o, prof))); })
      .catch(() => {});
    const t = setTimeout(load, 0);
    window.addEventListener(OPENING_EVENT, load);
    return () => { live = false; clearTimeout(t); window.removeEventListener(OPENING_EVENT, load); };
  }, []);
  return list;
}

export default function OpeningBalances({ initialParty = 'client', onClose }) {
  const [party, setParty] = useState(initialParty);
  const [all, setAll] = useState(null);
  const [profile, setProfile] = useState(null);
  const [names, setNames] = useState({ client: [], supplier: [] });
  const [form, setForm] = useState(null); // add / edit
  const [paying, setPaying] = useState(null); // { ob, amount, date, mode, note }
  const [showImport, setShowImport] = useState(false);
  const [asOnDefault, setAsOnDefault] = useState(localToday());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [rows, prof, clients, purchases] = await Promise.all([
        getAllOpeningBalances(), getProfile().catch(() => null), getAllClients().catch(() => []), getAllPurchases().catch(() => []),
      ]);
      setProfile(prof);
      setAll((rows || []).filter((o) => belongsToProfile(o, prof)));
      const uniq = (arr) => [...new Map(arr.filter(Boolean).map((n) => [partyKey(n), n.trim()])).values()].sort((a, b) => a.localeCompare(b));
      setNames({
        client: uniq((clients || []).map((c) => c.name)),
        supplier: uniq((purchases || []).filter((p) => belongsToProfile(p, prof)).map((p) => p.supplierName)),
      });
    } catch {
      toast('Could not load opening balances', 'error');
      setAll([]);
    }
  };
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, []);

  const changed = async () => { await load(); window.dispatchEvent(new Event(OPENING_EVENT)); };
  const rows = useMemo(() => (all || []).filter((o) => o.party === party).sort((a, b) => a.name.localeCompare(b.name)), [all, party]);
  const totals = rows.reduce((t, o) => {
    const d = openingDue(o);
    if (d > 0) t.open += d; else t.advance += -d;
    return t;
  }, { open: 0, advance: 0 });
  const who = party === 'client' ? 'client' : 'supplier';

  const save = async (entry) => {
    setBusy(true);
    setError('');
    try {
      const problem = validateOpening(entry);
      if (problem) { setError(problem); return false; }
      const dup = openingFor(all, entry.party, entry.name);
      if (dup && dup.id !== entry.id) { setError(`${dup.name} already has an opening balance. Edit that one instead.`); return false; }
      await saveOpeningBalance({
        ...entry,
        ownerGstin: entry.ownerGstin ?? (profile?.gstin || ''),
        ownerName: entry.ownerName ?? (profile?.businessName || ''),
      });
      await changed();
      return true;
    } catch (e) {
      setError(e.message || 'Could not save');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openAdd = () => { setError(''); setPaying(null); setForm({ party, name: '', amount: '', direction: 'owed', asOn: asOnDefault, note: '', payments: [] }); };
  const openEdit = (ob) => { setError(''); setPaying(null); setForm({ ...ob, amount: String(ob.amount) }); };
  const submitForm = async (e) => {
    e.preventDefault();
    const entry = { ...form, amount: Number(form.amount), name: form.name.trim() };
    if (await save(entry)) { toast(form.id ? 'Opening balance updated' : 'Opening balance saved', 'success'); setForm(null); }
  };

  const remove = async (ob) => {
    const fromReceipts = (ob.payments || []).some((p) => p.receiptNo);
    if (!(await confirmAction({
      title: `Delete the opening balance of ${ob.name}?`,
      message: fromReceipts
        ? 'Receipts were recorded against it. The receipts stay in Receipts, but they will no longer reduce this balance.'
        : 'It no longer counts in their outstanding. Invoices and payments are not touched.',
      confirmLabel: 'Delete', tone: 'danger',
    }))) return;
    try { await deleteOpeningBalance(ob.id); await changed(); toast('Opening balance deleted', 'success'); }
    catch (e) { toast(e.message || 'Could not delete', 'error'); }
  };

  const openPay = (ob) => { setForm(null); setError(''); setPaying({ ob, amount: String(openingDue(ob)), date: localToday(), mode: 'bank-transfer', note: '' }); };
  const submitPay = async (e) => {
    e.preventDefault();
    const amount = Math.round(Number(paying.amount) * 100) / 100;
    if (!(amount > 0)) { setError('Enter an amount more than 0.'); return; }
    if (amount > openingDue(paying.ob) + 0.005) { setError(`More than the ${formatCurrency(openingDue(paying.ob))} still open.`); return; }
    const payment = { id: `obp_${Date.now().toString(36)}`, date: paying.date, amount, mode: paying.mode, note: paying.note.trim() };
    if (await save({ ...paying.ob, payments: [...(paying.ob.payments || []), payment] })) {
      toast(`${party === 'client' ? 'Payment received' : 'Payment made'}: ${formatCurrency(amount)}`, 'success');
      setPaying(null);
    }
  };
  const removePayment = async (ob, pid) => {
    if (!(await confirmAction({ title: 'Remove this payment?', message: 'The opening balance goes back up by this amount.', confirmLabel: 'Remove', tone: 'warning' }))) return;
    const next = { ...ob, payments: ob.payments.filter((p) => p.id !== pid) };
    if (await save(next)) { toast('Payment removed', 'success'); setForm((f) => (f && f.id === ob.id ? { ...f, payments: next.payments } : f)); }
  };

  const label = { display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: 4 };
  const num = { textAlign: 'right', whiteSpace: 'nowrap' };

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="ob-title"
        style={{ maxWidth: 920, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
          <div>
            <h3 id="ob-title" className="section-title" style={{ margin: 0, textTransform: 'none' }}>
              Opening balances <HelpButton title="Opening balances" doc="clients#opening-balances" size={16} />
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              What each party owed on the day you started using {profile?.businessName ? `the app for ${profile.businessName}` : 'this app'}. It is added to their outstanding everywhere.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close" aria-label="Close"><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', margin: '1rem 0' }} role="tablist">
          {[['client', 'Clients (they owe you)'], ['supplier', 'Suppliers (you owe them)']].map(([v, t]) => (
            <button key={v} type="button" role="tab" aria-selected={party === v}
              className={`btn ${party === v ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setParty(v); setForm(null); setPaying(null); setError(''); }}>{t}</button>
          ))}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-secondary" onClick={() => setShowImport(true)}><Upload size={15} /> Import CSV</button>
          <button type="button" className="btn btn-secondary" disabled={!all?.length}
            onClick={() => download(openingToCsv(all), `Opening-balances-${localToday()}.csv`)}><Download size={15} /> Export</button>
          <button type="button" className="btn btn-primary" onClick={openAdd}><Plus size={15} /> Add</button>
        </div>

        {form && (
          <form onSubmit={submitForm} className="surface-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={label} htmlFor="ob-name">{party === 'client' ? 'Client' : 'Supplier'} name *</label>
                <input id="ob-name" className="form-input" list="ob-names" value={form.name} autoFocus
                  onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={party === 'client' ? 'As on your invoices' : 'As on your purchase bills'} />
                <datalist id="ob-names">{names[party].map((n) => <option key={n} value={n} />)}</datalist>
              </div>
              <div>
                <label style={label} htmlFor="ob-amount">Amount (₹) *</label>
                <input id="ob-amount" className="form-input" type="number" min="0" step="0.01" inputMode="decimal" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <label style={label} htmlFor="ob-dir">Balance is</label>
                <select id="ob-dir" className="form-input" value={form.direction} disabled={(form.payments || []).length > 0}
                  onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                  <option value="owed">{dirLabel(party, 'owed')} ({party === 'client' ? 'Dr' : 'Cr'})</option>
                  <option value="advance">{dirLabel(party, 'advance')} ({party === 'client' ? 'Cr' : 'Dr'})</option>
                </select>
              </div>
              <div>
                <label style={label} htmlFor="ob-date">As on *</label>
                <input id="ob-date" className="form-input" type="date" value={form.asOn} onChange={(e) => setForm({ ...form, asOn: e.target.value })} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={label} htmlFor="ob-note">Note</label>
                <input id="ob-note" className="form-input" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Closing balance from Miracle" />
              </div>
            </div>
            {(form.payments || []).length > 0 && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}>
                <strong>Payments against it</strong>
                <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem' }}>
                  {form.payments.map((p) => (
                    <li key={p.id || p.receiptNo}>
                      {fmtDay(p.date)} · {formatCurrency(p.amount)} · {purchasePaymentModeName(p.mode)}{p.note ? ` · ${p.note}` : ''}
                      {p.receiptNo
                        ? <span style={{ color: 'var(--text-muted)' }}> (from receipt {p.receiptNo}; change it in Receipts)</span>
                        : <button type="button" onClick={() => removePayment(form, p.id)} style={{ marginLeft: 8, background: 'none', border: 0, color: 'var(--danger, #dc2626)', cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}>remove</button>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {error && <p role="alert" style={{ color: 'var(--danger, #dc2626)', fontSize: '0.82rem', margin: '0.6rem 0 0' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => { setForm(null); setError(''); }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}

        {paying && (
          <form onSubmit={submitPay} className="surface-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
            <p style={{ margin: '0 0 0.6rem', fontWeight: 600 }}>
              {party === 'client' ? 'Payment received from' : 'Payment made to'} {paying.ob.name} · {formatCurrency(openingDue(paying.ob))} still open
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
              <div>
                <label style={label} htmlFor="obp-amt">Amount (₹)</label>
                <input id="obp-amt" className="form-input" type="number" min="0" step="0.01" value={paying.amount} autoFocus onChange={(e) => setPaying({ ...paying, amount: e.target.value })} />
              </div>
              <div>
                <label style={label} htmlFor="obp-date">Date</label>
                <input id="obp-date" className="form-input" type="date" value={paying.date} onChange={(e) => setPaying({ ...paying, date: e.target.value })} />
              </div>
              <div>
                <label style={label} htmlFor="obp-mode">Mode</label>
                <select id="obp-mode" className="form-input" value={paying.mode} onChange={(e) => setPaying({ ...paying, mode: e.target.value })}>
                  {PURCHASE_PAYMENT_MODES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={label} htmlFor="obp-note">Reference / note</label>
                <input id="obp-note" className="form-input" value={paying.note} onChange={(e) => setPaying({ ...paying, note: e.target.value })} placeholder="Cheque no., UTR…" />
              </div>
            </div>
            {party === 'client' && (
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Need a printed receipt? Record it in Receipts instead and choose <b>Opening balance</b>; it counts here too.
              </p>
            )}
            {error && <p role="alert" style={{ color: 'var(--danger, #dc2626)', fontSize: '0.82rem', margin: '0.6rem 0 0' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => { setPaying(null); setError(''); }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save payment'}</button>
            </div>
          </form>
        )}

        {all === null ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
        ) : rows.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem 1rem' }}>
            <Wallet size={40} />
            <p>No {who} opening balances yet.</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: 520, margin: '0 auto' }}>
              Add each {who}&apos;s balance from your old software as on the day you start here, or import them all from a CSV
              (Name, Amount, Dr/Cr).
            </p>
          </div>
        ) : (
          <div className="table-scroll" style={{ maxHeight: '48vh', overflowY: 'auto' }}>
            <table className="data-table" style={{ fontSize: '0.85rem', minWidth: 0, width: '100%' }}>
              <thead>
                <tr>
                  <th>{party === 'client' ? 'Client' : 'Supplier'}</th>
                  <th>Balance</th>
                  <th style={num}>Amount</th>
                  <th style={num}>Paid</th>
                  <th style={num}>Still open</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const due = openingDue(o);
                  return (
                    <tr key={o.id}>
                      <td className="font-medium" style={{ whiteSpace: 'normal', minWidth: 140 }}>{o.name}{o.note ? <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>{o.note}</div> : null}</td>
                      <td>{dirLabel(o.party, o.direction)}<div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>as on {fmtDay(o.asOn)}</div></td>
                      <td style={num}>{formatCurrency(o.amount)}</td>
                      <td style={num}>{o.direction === 'owed' ? formatCurrency(openingPaid(o)) : '—'}</td>
                      <td style={{ ...num, fontWeight: 700, color: due > 0.005 ? '#dc2626' : due < -0.005 ? '#0369a1' : '#059669' }}>
                        {due < -0.005 ? `${formatCurrency(-due)} Cr` : due > 0.005 ? formatCurrency(due) : 'Settled'}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {o.direction === 'owed' && due > 0.005 && (
                          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }} onClick={() => openPay(o)}>
                            {party === 'client' ? 'Received' : 'Paid'}
                          </button>
                        )}
                        <button type="button" className="icon-btn" onClick={() => openEdit(o)} title="Edit" aria-label={`Edit ${o.name}`}><Pencil size={15} /></button>
                        <button type="button" className="icon-btn icon-btn-red" onClick={() => remove(o)} title="Delete" aria-label={`Delete ${o.name}`}><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td colSpan={4}>{rows.length} {who}{rows.length === 1 ? '' : 's'}{totals.advance > 0.005 ? ` · advances ${formatCurrency(totals.advance)}` : ''}</td>
                  <td style={num}>{formatCurrency(totals.open)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {showImport && (
          <CsvListImport what="opening balances" sample={OPENING_SAMPLE} sampleName="Opening-balances-sample.csv" doc="clients#opening-balances"
            intro={(
              <>
                One party per row: Name and Amount, plus Type (Client / Supplier), Dr/Cr and As on if you have them.
                A Miracle or Tally list of closing balances works: Dr is a client who owes you, Cr a supplier you owe.
                Rows with no date get{' '}
                <input type="date" value={asOnDefault} onChange={(e) => setAsOnDefault(e.target.value)} aria-label="As on date for rows without one"
                  style={{ font: 'inherit', padding: '0 0.25rem' }} />.
              </>
            )}
            parse={(text) => {
              const r = openingCsvToList(text, { defaultAsOn: asOnDefault });
              const fresh = r.list.filter((o) => !openingFor(all, o.party, o.name));
              return { list: fresh, skipped: r.skipped + (r.list.length - fresh.length), errors: r.errors };
            }}
            save={(o) => saveOpeningBalance({ ...o, ownerGstin: profile?.gstin || '', ownerName: profile?.businessName || '' })}
            onClose={() => setShowImport(false)}
            onDone={() => { setShowImport(false); changed(); }} />
        )}
      </div>
    </div>
  );
}
