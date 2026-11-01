// Divtech Hisaab - Freight (jakat / bhada): what you pay transporters to bring
// goods in, each booked to a freight account for that goods. GST on freight
// from a goods transport agency is under reverse charge (RCM): it is listed
// here, goes into GSTR-3B 3.1(d) and 4(A)(3), and the month's register is
// what the GST filer needs. Rules: utils/freight.js; accounts: utils/ledgers.js.
import { useMemo, useState } from 'react';
import { Truck, Save, Edit3, Trash2, X, Search, BookOpen } from 'lucide-react';
import { saveFreight, deleteFreight } from '../store';
import { formatCurrency, localToday, parseLocalDate, decodeGstin, getStateCode } from '../utils';
import { FREIGHT_RATES, freightTax, freightProblem, freightAccountName, freightRcmTotals } from '../utils/freight';
import { periodRange } from '../utils/cashBook';
import { openLedger } from '../utils/openLedger';
import useBooks from './useBooks';
import MoneyAccountSelect, { showsBankChoice } from './MoneyAccountSelect';
import { confirmClosedYear } from './useClosedYears';
import HelpButton from './HelpButton';
import TableExport from './TableExport';
import { toast } from './Toast';
import { confirmAction } from './ConfirmModal';

const MODES = [['cash', 'Cash'], ['bank-transfer', 'Bank transfer'], ['upi', 'UPI'], ['cheque', 'Cheque'], ['credit', 'On credit (payable to the transporter)']];
const PERIODS = [['month', 'This month'], ['lastMonth', 'Last month'], ['fy', 'This financial year'], ['all', 'All dates']];
const blank = () => ({ id: '', date: localToday(), goods: '', transporter: '', transporterGstin: '', lrNo: '', vehicleNo: '', fromPlace: '', toPlace: '', againstBill: '', amount: '', rcmRate: 5, interstate: false, paymentMode: 'cash', account: '', note: '' });
const showDate = (d) => (d ? parseLocalDate(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export default function FreightView() {
  const { data, profile, reload } = useBooks();
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [period, setPeriod] = useState('month');
  const [search, setSearch] = useState('');
  const list = useMemo(() => data?.freight || [], [data]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const goodsNames = useMemo(() => [...new Set([...list.map((f) => f.goods), ...(data?.products || []).filter((p) => p.kind !== 'service').map((p) => p.name)].filter(Boolean))].sort(), [list, data]);
  const transporters = useMemo(() => {
    const m = new Map();
    for (const f of list) if (f.transporter && !m.has(f.transporter)) m.set(f.transporter, f.transporterGstin || '');
    for (const s of data?.suppliers || []) if (s.name && !m.has(s.name)) m.set(s.name, s.gstin || '');
    return m;
  }, [list, data]);
  const bills = (data?.purchases || []).filter((p) => !p.isReturn).slice(0, 80);

  // A transporter in another state charges IGST.
  const pickTransporter = (name) => {
    const gstin = transporters.get(name);
    setForm((f) => ({ ...f, transporter: name, ...(gstin !== undefined && !f.transporterGstin ? { transporterGstin: gstin, interstate: interstateFor(gstin) } : {}) }));
  };
  const interstateFor = (gstin) => {
    const d = decodeGstin(gstin || '');
    const mine = String(profile?.gstin || '').slice(0, 2) || getStateCode(profile?.state || '');
    return !!(d && mine && String(gstin).slice(0, 2) !== mine);
  };

  const tax = freightTax(form);
  const save = async (e) => {
    e.preventDefault();
    const record = {
      ...form, amount: Number(form.amount), rcmRate: Number(form.rcmRate),
      account: showsBankChoice(form.paymentMode) ? form.account : '',
      ownerGstin: form.ownerGstin ?? profile?.gstin ?? '', ownerName: form.ownerName ?? profile?.businessName ?? '',
    };
    if (!record.id) delete record.id;
    const problem = freightProblem(record);
    if (problem) { toast(problem, 'warning'); return; }
    if (!(await confirmClosedYear(form.date, profile))) return;
    setSaving(true);
    try {
      await saveFreight(record);
      toast(`Freight of ${formatCurrency(record.amount)} saved${tax.tax ? `, RCM ${formatCurrency(tax.tax)}` : ''}`, 'success');
      setForm((f) => ({ ...blank(), date: f.date, goods: f.goods, transporter: f.transporter, transporterGstin: f.transporterGstin, interstate: f.interstate, rcmRate: f.rcmRate, paymentMode: f.paymentMode, account: f.account }));
      reload();
    } catch (err) { toast(err.message || 'Could not save', 'error'); } finally { setSaving(false); }
  };
  const edit = (f) => { setForm({ ...blank(), ...f, amount: String(f.amount) }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const remove = async (f) => {
    if (!(await confirmAction({ title: 'Delete this freight entry?', message: `${formatCurrency(f.amount)} to ${f.transporter} on ${showDate(f.date)} leaves the freight account, the RCM and the books.`, confirmLabel: 'Delete', tone: 'danger' }))) return;
    if (!(await confirmClosedYear(f.date, profile))) return;
    await deleteFreight(f.id);
    toast('Freight entry deleted', 'success');
    if (form.id === f.id) setForm(blank());
    reload();
  };

  const range = periodRange(period);
  const q = search.trim().toLowerCase();
  const shown = list.filter((f) => (period === 'all' || ((!range.from || f.date >= range.from) && (!range.to || f.date <= range.to)))
    && (!q || [f.goods, f.transporter, f.transporterGstin, f.lrNo, f.vehicleNo, f.againstBill].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const totals = freightRcmTotals(shown);
  const byGoods = Object.entries(shown.reduce((m, f) => { const k = freightAccountName(f.goods); m[k] = (m[k] || 0) + (Number(f.amount) || 0); return m; }, {})).sort((a, b) => b[1] - a[1]);
  const periodLabel = PERIODS.find(([k]) => k === period)[1];
  const label = { display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 };
  const muted = { color: 'var(--text-muted)', fontSize: '0.8rem' };
  const right = { textAlign: 'right', whiteSpace: 'nowrap' };

  return (
    <div className="dashboard-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Freight (RCM) <HelpButton title="Freight" doc="freight" size={16} /></h1>
          <p className="page-subtitle">Jakat / bhada on goods brought in, by goods, with GST under reverse charge</p>
        </div>
      </div>

      <form className="glass-panel p-4 mb-6" onSubmit={save} aria-label="Freight entry">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.75rem' }}>
          <h3 className="section-title" style={{ margin: 0 }}>{form.id ? 'Edit freight' : 'New freight entry'}</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <div><label style={label} htmlFor="frt-date">Date *</label>
            <input id="frt-date" type="date" className="form-input" value={form.date} onChange={set('date')} /></div>
          <div><label style={label} htmlFor="frt-goods">Goods (freight account)</label>
            <input id="frt-goods" className="form-input" list="frt-goods-list" value={form.goods} onChange={set('goods')} placeholder="Groundnut oil" />
            <datalist id="frt-goods-list">{goodsNames.map((g) => <option key={g} value={g} />)}</datalist></div>
          <div><label style={label} htmlFor="frt-tr">Transporter *</label>
            <input id="frt-tr" className="form-input" list="frt-tr-list" value={form.transporter} onChange={(e) => pickTransporter(e.target.value)} placeholder="Shree Krishna Roadlines" />
            <datalist id="frt-tr-list">{[...transporters.keys()].map((t) => <option key={t} value={t} />)}</datalist></div>
          <div><label style={label} htmlFor="frt-gstin">Transporter GSTIN</label>
            <input id="frt-gstin" className="form-input" value={form.transporterGstin} onChange={(e) => setForm((f) => ({ ...f, transporterGstin: e.target.value.toUpperCase(), interstate: interstateFor(e.target.value.toUpperCase()) }))} placeholder="Optional" /></div>
          <div><label style={label} htmlFor="frt-lr">LR / bilty no.</label>
            <input id="frt-lr" className="form-input" value={form.lrNo} onChange={set('lrNo')} /></div>
          <div><label style={label} htmlFor="frt-veh">Vehicle no.</label>
            <input id="frt-veh" className="form-input" value={form.vehicleNo} onChange={set('vehicleNo')} placeholder="GJ03AB1234" /></div>
          <div><label style={label} htmlFor="frt-from">From</label>
            <input id="frt-from" className="form-input" value={form.fromPlace} onChange={set('fromPlace')} /></div>
          <div><label style={label} htmlFor="frt-to">To</label>
            <input id="frt-to" className="form-input" value={form.toPlace} onChange={set('toPlace')} /></div>
          <div><label style={label} htmlFor="frt-bill">Purchase bill</label>
            <input id="frt-bill" className="form-input" list="frt-bill-list" value={form.againstBill} onChange={set('againstBill')} placeholder="Optional" />
            <datalist id="frt-bill-list">{bills.map((p) => <option key={p.id} value={p.invoiceNumber}>{p.supplierName}</option>)}</datalist></div>
          <div><label style={label} htmlFor="frt-amt">Freight amount *</label>
            <input id="frt-amt" type="number" min="0" step="0.01" className="form-input" value={form.amount} onChange={set('amount')} placeholder="0.00" /></div>
          <div><label style={label} htmlFor="frt-rate">GST (reverse charge)</label>
            <select id="frt-rate" className="form-input" value={form.rcmRate} onChange={set('rcmRate')}>
              {FREIGHT_RATES.map(([r, t]) => <option key={r} value={r}>{t}</option>)}
            </select></div>
          <div><label style={label} htmlFor="frt-mode">Paid</label>
            <select id="frt-mode" className="form-input" value={form.paymentMode} onChange={set('paymentMode')}>
              {MODES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select></div>
          <MoneyAccountSelect id="frt-account" mode={form.paymentMode} value={form.account} label="Paid from" onChange={(v) => setForm((f) => ({ ...f, account: v }))} style={{ margin: 0 }} />
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}>
              <input type="checkbox" checked={!!form.interstate} onChange={set('interstate')} /> Transporter in another state (IGST)
            </label>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={label} htmlFor="frt-note">Note</label>
            <input id="frt-note" className="form-input" value={form.note} onChange={set('note')} placeholder="Optional" />
          </div>
          <div style={{ fontSize: '0.85rem', minWidth: 220 }}>
            {tax.tax > 0
              ? <>RCM {tax.rate}%: <strong>{formatCurrency(tax.tax)}</strong> ({tax.igst ? `IGST ${formatCurrency(tax.igst)}` : `CGST ${formatCurrency(tax.cgst)} + SGST ${formatCurrency(tax.sgst)}`}). You pay it with GSTR-3B and claim it back.</>
              : <span style={muted}>No GST on this freight.</span>}
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} /> {form.id ? 'Update' : 'Save'}</button>
          {form.id && <button type="button" className="btn btn-secondary" onClick={() => setForm(blank())}><X size={16} /> Cancel</button>}
        </div>
      </form>

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card"><div className="stat-icon stat-icon-blue"><Truck size={22} /></div>
          <div><p className="stat-label">Freight · {periodLabel}</p><h2 className="stat-value">{formatCurrency(totals.taxable + totals.exempt)}</h2></div></div>
        <div className="stat-card"><div className="stat-icon stat-icon-green"><Truck size={22} /></div>
          <div><p className="stat-label">GST under RCM (3.1(d))</p><h2 className="stat-value">{formatCurrency(totals.tax)}</h2>
            <div style={muted}>{totals.igst ? `IGST ${formatCurrency(totals.igst)} · ` : ''}CGST {formatCurrency(totals.cgst)} · SGST {formatCurrency(totals.sgst)}</div></div></div>
        <div className="stat-card"><div>
          <p className="stat-label">Freight accounts</p>
          {byGoods.length ? byGoods.slice(0, 4).map(([n, v]) => (
            <div key={n} style={{ fontSize: '0.82rem', display: 'flex', gap: 6, alignItems: 'center' }}>
              <a href="#" onClick={(ev) => { ev.preventDefault(); openLedger(`expense:${n}`); }} style={{ color: 'inherit' }}>{n}</a>
              <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{formatCurrency(v)}</span>
            </div>
          )) : <div style={muted}>None yet</div>}
        </div></div>
      </div>

      <div className="glass-panel p-4 mb-4">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-box" style={{ maxWidth: 300 }}>
            <Search size={16} className="search-icon" />
            <input className="search-input" placeholder="Search goods, transporter, LR, vehicle..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search freight" />
          </div>
          <select className="filter-select" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Dates">
            {PERIODS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="glass-panel">
        <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3>Freight / RCM register <span style={muted}>· {periodLabel} · {shown.length}</span></h3>
          <TableExport title="Freight / RCM register" filename={`Freight-RCM-${periodLabel}`} landscape
            subtitle={[profile?.businessName, profile?.gstin, periodLabel].filter(Boolean).join(', ')}
            headers={['Date', 'Transporter', 'GSTIN', 'LR no.', 'Vehicle', 'From', 'To', 'Goods', 'Purchase bill', 'Freight', 'RCM rate %', 'IGST', 'CGST', 'SGST', 'RCM total']}
            rows={[...shown.map((f) => { const x = freightTax(f); return [f.date, f.transporter, f.transporterGstin || '', f.lrNo || '', f.vehicleNo || '', f.fromPlace || '', f.toPlace || '', f.goods || '', f.againstBill || '', x.taxable, x.rate, x.igst, x.cgst, x.sgst, x.tax]; }),
              ['Total', '', '', '', '', '', '', '', '', Math.round((totals.taxable + totals.exempt) * 100) / 100, '', totals.igst, totals.cgst, totals.sgst, totals.tax]]} />
        </div>
        {!data ? <div className="empty-state"><p>Loading...</p></div> : shown.length === 0 ? (
          <div className="empty-state"><Truck size={48} /><p>{list.length ? 'Nothing in these dates.' : 'No freight entered yet.'}</p></div>
        ) : (
          <div className="table-scroll">
            <table className="data-table" style={{ minWidth: 900 }}>
              <thead><tr><th>Date</th><th>Transporter</th><th>Goods</th><th>LR / vehicle</th><th style={right}>Freight</th><th style={right}>RCM</th><th>Paid</th><th className="col-center">Actions</th></tr></thead>
              <tbody>
                {shown.map((f) => { const x = freightTax(f); return (
                  <tr key={f.id}>
                    <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{showDate(f.date)}</td>
                    <td><div className="font-medium">{f.transporter}</div><div style={muted}>{f.transporterGstin || 'No GSTIN'}</div></td>
                    <td>{f.goods || '-'}{f.againstBill && <div style={muted}>Bill {f.againstBill}</div>}</td>
                    <td style={muted}>{[f.lrNo && `LR ${f.lrNo}`, f.vehicleNo, [f.fromPlace, f.toPlace].filter(Boolean).join(' → ')].filter(Boolean).join(' · ') || '-'}</td>
                    <td style={{ ...right, fontWeight: 600 }}>{formatCurrency(x.taxable)}</td>
                    <td style={right}>{x.tax ? `${formatCurrency(x.tax)} (${x.rate}%)` : '-'}</td>
                    <td style={muted}>{(MODES.find(([v]) => v === f.paymentMode) || [])[1] || f.paymentMode}</td>
                    <td><div className="table-actions">
                      <button className="icon-btn icon-btn-blue" title="Freight account ledger" aria-label="Ledger" onClick={() => openLedger(`expense:${freightAccountName(f.goods)}`)}><BookOpen size={15} /></button>
                      <button className="icon-btn" title="Edit" aria-label="Edit" onClick={() => edit(f)}><Edit3 size={15} /></button>
                      <button className="icon-btn icon-btn-red" title="Delete" aria-label="Delete" onClick={() => remove(f)}><Trash2 size={15} /></button>
                    </div></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ ...muted, padding: '0.75rem 1rem' }}>
          The RCM is in GSTR-3B (3.1(d) to pay, 4(A)(3) to claim back) and in the GST Excel. Pay it with Record GST paid on the GSTR-3B tab. The register above (Print / Excel) is what the GST filer needs each month.
        </p>
      </div>
    </div>
  );
}
