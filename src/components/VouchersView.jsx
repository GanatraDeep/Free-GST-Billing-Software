// Divtech Hisaab - Vouchers: entries that are not an invoice, a purchase bill,
// a receipt from a customer or an expense. Payment (money out: a loan
// instalment, an advance given), Receipt (money in: a loan taken, capital
// brought in), Contra (cash, bank and CC between themselves) and Journal
// (no money moves: depreciation, interest charged on the CC, adjustments).
// Rules: utils/vouchers.js. Postings: utils/ledgers.js.
import { useMemo, useState } from 'react';
import { FileText, Plus, Trash2, Edit3, Save, X, Search } from 'lucide-react';
import { saveVoucher, deleteVoucher } from '../store';
import { formatCurrency, getFinancialYearLabel, localToday, parseLocalDate } from '../utils';
import { VOUCHER_TYPES, voucherProblem, nextVoucherNumber } from '../utils/vouchers';
import { postableAccounts, accountInfo } from '../utils/ledgers';
import { periodRange } from '../utils/cashBook';
import useBooks from './useBooks';
import { confirmClosedYear } from './useClosedYears';
import HelpButton from './HelpButton';
import TableExport from './TableExport';
import { toast } from './Toast';
import { confirmAction, promptAction } from './ConfirmModal';

const MONEY = (groups) => groups.find((g) => g.group === 'Cash, bank and CC')?.items || [];
const blankLine = () => ({ account: '', dr: '', cr: '' });
const blankForm = (type = 'payment') => ({ id: '', type, date: localToday(), number: '', narration: '', money: 'cash', other: '', from: 'cash', to: 'bank', amount: '', lines: [blankLine(), blankLine()] });
const showDate = (d) => (d ? parseLocalDate(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const PERIODS = [['fy', 'This financial year'], ['month', 'This month'], ['lastMonth', 'Last month'], ['all', 'All dates']];

// An account picker: grouped, with "New expense head" at the end.
function AccountSelect({ value, onChange, groups, id, label, exclude = [] }) {
  const known = groups.some((g) => g.items.some((i) => i.id === value));
  return (
    <select id={id} className="form-input" aria-label={label} value={value}
      onChange={async (e) => {
        if (e.target.value !== '__newexp') { onChange(e.target.value); return; }
        const name = (await promptAction({ title: 'New expense head', message: 'For example Shop maintenance or Staff welfare.', placeholder: 'Expense head', confirmLabel: 'Use it' }) || '').trim();
        if (name) onChange(`expense:${name.slice(0, 80)}`);
      }}>
      <option value="">Pick an account...</option>
      {!known && value && <option value={value}>{value.replace(/^expense:/, '')}</option>}
      {groups.map((g) => (
        <optgroup key={g.group} label={g.group}>
          {g.items.filter((i) => !exclude.includes(i.id)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </optgroup>
      ))}
      <option value="__newexp">+ New expense head...</option>
    </select>
  );
}

export default function VouchersView({ onOpenView }) {
  const { data, profile, reload } = useBooks();
  const [form, setForm] = useState(() => blankForm());
  const [saving, setSaving] = useState(false);
  const [period, setPeriod] = useState('fy');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const groups = useMemo(() => (data ? postableAccounts(data) : []), [data]);
  const money = MONEY(groups);
  const vouchers = data?.vouchers || [];
  const nameOf = (id) => accountInfo(id, data?.accounts || []).name;

  const lines = () => {
    const amt = Number(form.amount) || 0;
    if (form.type === 'payment') return [{ account: form.other, dr: amt, cr: 0 }, { account: form.money, dr: 0, cr: amt }];
    if (form.type === 'receipt') return [{ account: form.money, dr: amt, cr: 0 }, { account: form.other, dr: 0, cr: amt }];
    if (form.type === 'contra') return [{ account: form.to, dr: amt, cr: 0 }, { account: form.from, dr: 0, cr: amt }];
    return form.lines.map((l) => ({ account: l.account, dr: Number(l.dr) || 0, cr: Number(l.cr) || 0 }));
  };
  const jTotals = form.lines.reduce((t, l) => ({ dr: t.dr + (Number(l.dr) || 0), cr: t.cr + (Number(l.cr) || 0) }), { dr: 0, cr: 0 });

  const save = async (e) => {
    e.preventDefault();
    if (form.type === 'contra' && form.from === form.to) { toast('Pick two different accounts', 'warning'); return; }
    const record = {
      id: form.id || undefined, type: form.type, date: form.date, narration: form.narration.trim(), lines: lines(),
      number: form.number || nextVoucherNumber(vouchers, form.type, getFinancialYearLabel(parseLocalDate(form.date))),
      ownerGstin: form.ownerGstin ?? profile?.gstin ?? '', ownerName: form.ownerName ?? profile?.businessName ?? '',
      ...(form.createdAt ? { createdAt: form.createdAt } : {}),
    };
    const problem = voucherProblem(record);
    if (problem) { toast(problem, 'warning'); return; }
    if (!(await confirmClosedYear(form.date, profile))) return;
    setSaving(true);
    try {
      await saveVoucher(record);
      toast(`${record.number} saved`, 'success');
      setForm((f) => ({ ...blankForm(f.type), date: f.date, money: f.money }));
      reload();
    } catch (err) { toast(err.message || 'Could not save', 'error'); } finally { setSaving(false); }
  };

  const edit = (v) => {
    const ls = v.lines || [];
    const drs = ls.filter((l) => l.dr > 0); const crs = ls.filter((l) => l.cr > 0);
    const base = { ...blankForm(v.type), id: v.id, type: v.type, date: v.date, number: v.number, narration: v.narration || '', createdAt: v.createdAt, ownerGstin: v.ownerGstin, ownerName: v.ownerName };
    if (v.type !== 'journal' && drs.length === 1 && crs.length === 1) {
      const amount = String(drs[0].dr);
      if (v.type === 'payment') setForm({ ...base, other: drs[0].account, money: crs[0].account, amount });
      else if (v.type === 'receipt') setForm({ ...base, money: drs[0].account, other: crs[0].account, amount });
      else setForm({ ...base, to: drs[0].account, from: crs[0].account, amount });
    } else {
      setForm({ ...base, type: 'journal', lines: ls.map((l) => ({ account: l.account, dr: l.dr ? String(l.dr) : '', cr: l.cr ? String(l.cr) : '' })) });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const remove = async (v) => {
    if (!(await confirmAction({ title: `Delete ${v.number || 'this voucher'}?`, message: 'Its entries leave every ledger and the final accounts.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    if (!(await confirmClosedYear(v.date, profile))) return;
    await deleteVoucher(v.id);
    toast('Voucher deleted', 'success');
    if (form.id === v.id) setForm(blankForm(form.type));
    reload();
  };

  const range = periodRange(period === 'all' ? 'all' : period);
  const q = search.trim().toLowerCase();
  const shown = vouchers.filter((v) => (!typeFilter || v.type === typeFilter)
    && (period === 'all' || ((!range.from || v.date >= range.from) && (!range.to || v.date <= range.to)))
    && (!q || [v.number, v.narration, ...(v.lines || []).map((l) => nameOf(l.account))].join(' ').toLowerCase().includes(q)));
  const amountOf = (v) => (v.lines || []).reduce((s, l) => s + (Number(l.dr) || 0), 0);
  const side = (v, k) => (v.lines || []).filter((l) => l[k] > 0).map((l) => nameOf(l.account)).join(', ');
  const typeName = Object.fromEntries(VOUCHER_TYPES.map(([id, n]) => [id, n]));
  const label = { display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 };
  const muted = { color: 'var(--text-muted)', fontSize: '0.8rem' };
  const right = { textAlign: 'right', whiteSpace: 'nowrap' };
  const desc = VOUCHER_TYPES.find(([id]) => id === form.type)?.[2];

  return (
    <div className="dashboard-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Vouchers <HelpButton title="Vouchers" doc="accounts#vouchers" size={16} /></h1>
          <p className="page-subtitle">Loans, capital, CC, interest, depreciation and other entries</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => onOpenView?.('accounts')}>Accounts</button>
      </div>

      <form className="glass-panel p-4 mb-6" onSubmit={save} aria-label="Voucher">
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }} role="group" aria-label="Voucher type">
          {VOUCHER_TYPES.map(([id, name]) => (
            <button key={id} type="button" className={`btn ${form.type === id ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={form.type === id}
              onClick={() => setForm((f) => ({ ...f, type: id }))} style={{ fontSize: '0.85rem', padding: '0.4rem 0.9rem' }}>{name}</button>
          ))}
          {form.id && <span style={{ ...muted, alignSelf: 'center', marginLeft: 8 }}>Editing {form.number}</span>}
        </div>
        <p style={{ ...muted, marginTop: 0 }}>{desc}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
          <div>
            <label style={label} htmlFor="v-date">Date *</label>
            <input id="v-date" type="date" className="form-input" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          {form.type === 'payment' && (
            <>
              <div><label style={label} htmlFor="v-money">Paid from *</label>
                <AccountSelect id="v-money" label="Paid from" value={form.money} onChange={(v) => setForm((f) => ({ ...f, money: v }))} groups={[{ group: 'Cash, bank and CC', items: money }]} /></div>
              <div><label style={label} htmlFor="v-other">Paid to (account) *</label>
                <AccountSelect id="v-other" label="Paid to" value={form.other} onChange={(v) => setForm((f) => ({ ...f, other: v }))} groups={groups} exclude={[form.money]} /></div>
            </>
          )}
          {form.type === 'receipt' && (
            <>
              <div><label style={label} htmlFor="v-money">Received in *</label>
                <AccountSelect id="v-money" label="Received in" value={form.money} onChange={(v) => setForm((f) => ({ ...f, money: v }))} groups={[{ group: 'Cash, bank and CC', items: money }]} /></div>
              <div><label style={label} htmlFor="v-other">Received from (account) *</label>
                <AccountSelect id="v-other" label="Received from" value={form.other} onChange={(v) => setForm((f) => ({ ...f, other: v }))} groups={groups} exclude={[form.money]} /></div>
            </>
          )}
          {form.type === 'contra' && (
            <>
              <div><label style={label} htmlFor="v-from">From *</label>
                <AccountSelect id="v-from" label="From" value={form.from} onChange={(v) => setForm((f) => ({ ...f, from: v }))} groups={[{ group: 'Cash, bank and CC', items: money }]} /></div>
              <div><label style={label} htmlFor="v-to">To *</label>
                <AccountSelect id="v-to" label="To" value={form.to} onChange={(v) => setForm((f) => ({ ...f, to: v }))} groups={[{ group: 'Cash, bank and CC', items: money }]} /></div>
            </>
          )}
          {form.type !== 'journal' && (
            <div><label style={label} htmlFor="v-amount">Amount *</label>
              <input id="v-amount" type="number" min="0" step="0.01" className="form-input" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" /></div>
          )}
        </div>

        {form.type === 'journal' && (
          <div className="table-scroll" style={{ marginTop: '0.75rem' }}>
            <table className="data-table" style={{ minWidth: 560 }}>
              <thead><tr><th>Account</th><th style={right}>Debit</th><th style={right}>Credit</th><th /></tr></thead>
              <tbody>
                {form.lines.map((l, i) => (
                  <tr key={i}>
                    <td style={{ minWidth: 260 }}><AccountSelect label={`Line ${i + 1} account`} value={l.account} groups={groups}
                      onChange={(v) => setForm((f) => ({ ...f, lines: f.lines.map((x, j) => (j === i ? { ...x, account: v } : x)) }))} /></td>
                    <td><input type="number" min="0" step="0.01" className="form-input" style={{ textAlign: 'right' }} aria-label={`Line ${i + 1} debit`} value={l.dr}
                      onChange={(e) => setForm((f) => ({ ...f, lines: f.lines.map((x, j) => (j === i ? { ...x, dr: e.target.value, cr: e.target.value ? '' : x.cr } : x)) }))} /></td>
                    <td><input type="number" min="0" step="0.01" className="form-input" style={{ textAlign: 'right' }} aria-label={`Line ${i + 1} credit`} value={l.cr}
                      onChange={(e) => setForm((f) => ({ ...f, lines: f.lines.map((x, j) => (j === i ? { ...x, cr: e.target.value, dr: e.target.value ? '' : x.dr } : x)) }))} /></td>
                    <td>{form.lines.length > 2 && <button type="button" className="icon-btn icon-btn-red" aria-label="Remove line" onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))}><X size={14} /></button>}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 600 }}>
                  <td><button type="button" className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem' }} onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, blankLine()] }))}><Plus size={13} /> Add line</button></td>
                  <td style={right}>{formatCurrency(jTotals.dr)}</td>
                  <td style={right}>{formatCurrency(jTotals.cr)}</td>
                  <td style={{ ...muted, color: Math.abs(jTotals.dr - jTotals.cr) > 0.005 ? 'var(--danger)' : 'var(--success)' }}>{Math.abs(jTotals.dr - jTotals.cr) > 0.005 ? `Off by ${formatCurrency(Math.abs(jTotals.dr - jTotals.cr))}` : 'Balanced'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label style={label} htmlFor="v-narr">Narration</label>
            <input id="v-narr" className="form-input" value={form.narration} onChange={(e) => setForm((f) => ({ ...f, narration: e.target.value }))} placeholder="e.g. CC interest for October, loan instalment no. 4" />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} /> {form.id ? 'Update' : 'Save'}</button>
          {form.id && <button type="button" className="btn btn-secondary" onClick={() => setForm(blankForm(form.type))}>Cancel</button>}
        </div>
      </form>

      <div className="glass-panel p-4 mb-4">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-box" style={{ maxWidth: 280 }}>
            <Search size={16} className="search-icon" />
            <input className="search-input" placeholder="Search number, account, narration..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search vouchers" />
          </div>
          <select className="filter-select" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Dates">
            {PERIODS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
          <select className="filter-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Type">
            <option value="">All types</option>
            {VOUCHER_TYPES.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
        </div>
      </div>

      <div className="glass-panel">
        <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3>Vouchers <span style={muted}>· {shown.length}</span></h3>
          <TableExport title="Vouchers" filename="Vouchers" subtitle={profile?.businessName || ''}
            headers={['Date', 'Number', 'Type', 'Debit', 'Credit', 'Amount', 'Narration']}
            rows={shown.map((v) => [showDate(v.date), v.number, typeName[v.type] || v.type, side(v, 'dr'), side(v, 'cr'), Math.round(amountOf(v) * 100) / 100, v.narration || ''])} />
        </div>
        {!data ? <div className="empty-state"><p>Loading...</p></div> : shown.length === 0 ? (
          <div className="empty-state"><FileText size={48} /><p>{vouchers.length ? 'No vouchers match.' : 'No vouchers yet.'}</p></div>
        ) : (
          <div className="table-scroll">
            <table className="data-table" style={{ minWidth: 760 }}>
              <thead><tr><th>Date</th><th>Number</th><th>Debit</th><th>Credit</th><th style={right}>Amount</th><th className="col-center">Actions</th></tr></thead>
              <tbody>
                {shown.map((v) => (
                  <tr key={v.id}>
                    <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{showDate(v.date)}</td>
                    <td><span className="invoice-badge">{v.number}</span><div style={muted}>{typeName[v.type]}</div></td>
                    <td style={{ whiteSpace: 'normal', maxWidth: 240 }}>{side(v, 'dr')}{v.narration && <div style={muted}>{v.narration}</div>}</td>
                    <td style={{ whiteSpace: 'normal', maxWidth: 240 }}>{side(v, 'cr')}</td>
                    <td style={{ ...right, fontWeight: 600 }}>{formatCurrency(amountOf(v))}</td>
                    <td><div className="table-actions">
                      <button className="icon-btn" title="Edit" aria-label={`Edit ${v.number}`} onClick={() => edit(v)}><Edit3 size={15} /></button>
                      <button className="icon-btn icon-btn-red" title="Delete" aria-label={`Delete ${v.number}`} onClick={() => remove(v)}><Trash2 size={15} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
