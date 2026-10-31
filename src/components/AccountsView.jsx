// Divtech Hisaab - Accounts: your own accounts beyond customers and suppliers.
// Capital, loans taken (secured / unsecured), the bank CC / OD account with its
// limit, fixed assets with their depreciation rate, loans and deposits given,
// other assets and liabilities, other incomes and expenses. Each has an
// opening balance; money in and out of them is entered as vouchers.
import { useMemo, useState } from 'react';
import { Landmark, Plus, Edit3, Trash2, BookOpen, X, Save, Calculator, FileText } from 'lucide-react';
import { saveAccount, deleteAccount, saveVoucher } from '../store';
import { formatCurrency, getFinancialYearLabel, localToday } from '../utils';
import { ACCOUNT_GROUP_CHOICES, naturalSide, accountProblem, nextVoucherNumber, depreciation } from '../utils/vouchers';
import { ACCOUNT_GROUPS, accountBalances, postings, side } from '../utils/ledgers';
import { periodRange } from '../utils/cashBook';
import { openLedger } from '../utils/openLedger';
import useBooks from './useBooks';
import HelpButton from './HelpButton';
import { toast } from './Toast';
import { confirmAction, promptAction } from './ConfirmModal';

const blank = { name: '', group: 'capital', opening: '', openingSide: 'Cr', asOn: '', limit: '', interestRate: '', depRate: '', accountNumber: '', note: '' };
const drCr = (v) => (Math.abs(v) < 0.005 ? formatCurrency(0) : `${formatCurrency(Math.abs(v))} ${side(v)}`);

export default function AccountsView({ onOpenView }) {
  const { data, profile, reload } = useBooks();
  const [form, setForm] = useState(null);
  const [warning, setWarning] = useState('');
  const balances = useMemo(() => (data ? accountBalances(data) : {}), [data]);
  const accounts = data?.accounts || [];

  const grouped = useMemo(() => ACCOUNT_GROUP_CHOICES
    .map(([group]) => ({ group, name: ACCOUNT_GROUPS[group]?.name || group, items: accounts.filter((a) => a.group === group).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.items.length), [accounts]);

  const openAdd = (group = 'capital') => { setWarning(''); setForm({ ...blank, group, openingSide: naturalSide(group), asOn: localToday() }); };
  const openEdit = (a) => { setWarning(''); setForm({ ...blank, ...a, opening: a.opening ? String(a.opening) : '', limit: a.limit ? String(a.limit) : '', interestRate: a.interestRate ? String(a.interestRate) : '', depRate: a.depRate ? String(a.depRate) : '' }); };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value, ...(k === 'group' && !f.id ? { openingSide: naturalSide(e.target.value) } : {}) }));

  const submit = async (e) => {
    e.preventDefault();
    const record = { ...form, ownerGstin: form.id ? form.ownerGstin : profile?.gstin || '', ownerName: form.id ? form.ownerName : profile?.businessName || '' };
    const problem = accountProblem(record, accounts);
    if (problem) { setWarning(problem); return; }
    try {
      await saveAccount(record);
      toast(form.id ? 'Account saved' : `${form.name.trim()} added`, 'success');
      setForm(null);
      reload();
    } catch (err) { setWarning(err.message || 'Could not save'); }
  };
  const remove = async (a) => {
    if (!(await confirmAction({ title: `Delete ${a.name}?`, message: 'The account and its opening balance go. An account used in vouchers cannot be deleted.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    try { await deleteAccount(a.id); toast('Account deleted', 'success'); reload(); } catch (err) { toast(err.message || 'Could not delete', 'error'); }
  };

  // Depreciation for this financial year as a journal voucher, on the
  // written-down value (half rate on additions used under 180 days).
  const addDepreciation = async (a) => {
    const { from, to } = periodRange('fy');
    const all = postings(data);
    const id = `acc:${a.id}`;
    const opening = all.filter((p) => p.account === id && p.date < from).reduce((s, p) => s + p.dr - p.cr, 0);
    const additions = all.filter((p) => p.account === id && p.date >= from && p.date <= to && p.dr > 0).map((p) => ({ date: p.date, amount: p.dr }));
    const done = (data.vouchers || []).some((v) => v.date >= from && v.date <= to && (v.lines || []).some((l) => l.account === id && l.cr > 0) && (v.lines || []).some((l) => l.account === 'expense:Depreciation'));
    const suggested = depreciation({ openingWdv: opening, additions, rate: Number(a.depRate) || 0, fyEnd: to });
    const value = await promptAction({
      title: `Depreciation on ${a.name}, FY ${getFinancialYearLabel(new Date(`${from}T00:00:00`))}`,
      message: `${done ? 'Depreciation is already entered for this year. ' : ''}${a.depRate ? `${a.depRate}% on the written-down value (${formatCurrency(opening)} at the start of the year${additions.length ? ` and ${formatCurrency(additions.reduce((s, x) => s + x.amount, 0))} added` : ''}).` : 'Set a depreciation rate on the account to have it worked out.'} A journal voucher is saved on ${to}: Depreciation Dr, ${a.name} Cr.`,
      defaultValue: String(suggested || ''), inputType: 'number', confirmLabel: 'Save voucher',
    });
    const amount = Math.round((Number(value) || 0) * 100) / 100;
    if (!(amount > 0)) return;
    try {
      await saveVoucher({
        type: 'journal', date: to, number: nextVoucherNumber(data.vouchers, 'journal', getFinancialYearLabel(new Date(`${to}T00:00:00`))),
        narration: `Depreciation on ${a.name}${a.depRate ? ` @ ${a.depRate}%` : ''}`,
        lines: [{ account: 'expense:Depreciation', dr: amount, cr: 0 }, { account: id, dr: 0, cr: amount }],
        ownerGstin: profile?.gstin || '', ownerName: profile?.businessName || '',
      });
      toast(`Depreciation of ${formatCurrency(amount)} entered`, 'success');
      reload();
    } catch (err) { toast(err.message || 'Could not save', 'error'); }
  };

  const label = { display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 };
  const num = { textAlign: 'right', whiteSpace: 'nowrap' };
  const muted = { color: 'var(--text-muted)', fontSize: '0.8rem' };

  return (
    <div className="dashboard-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Accounts <HelpButton title="Accounts" doc="accounts" size={16} /></h1>
          <p className="page-subtitle">Capital, loans, CC / OD, fixed assets, loans given and other accounts</p>
        </div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={() => onOpenView?.('vouchers')}><FileText size={16} /> Vouchers</button>
          <button type="button" className="btn btn-primary" onClick={() => openAdd()}><Plus size={18} /> Add account</button>
        </div>
      </div>

      {!data ? (
        <div className="glass-panel"><div className="empty-state"><p>Loading...</p></div></div>
      ) : accounts.length === 0 ? (
        <div className="glass-panel p-6">
          <div className="empty-state" style={{ padding: '1rem' }}>
            <Landmark size={48} />
            <p>No accounts yet. Start with the ones on your last balance sheet:</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.6rem' }}>
            {[['capital', 'Capital', 'What the owner has put in'], ['cc', 'Bank CC / OD', 'Cash credit with its limit'], ['secured-loans', 'Bank loan', 'Term or vehicle loan'], ['unsecured-loans', 'Loan from family', 'Unsecured loan taken'], ['fixed-assets', 'Fixed asset', 'Furniture, vehicle, computer'], ['loans-advances', 'Loan given', 'Money lent or advanced'], ['deposits', 'Deposit', 'Rent or electricity deposit'], ['investments', 'Investment', 'FD, shares, mutual fund']].map(([g, t, d]) => (
              <button key={g} type="button" className="btn btn-secondary" onClick={() => openAdd(g)} style={{ display: 'block', textAlign: 'left', padding: '0.7rem 0.9rem', height: 'auto' }}>
                <div style={{ fontWeight: 600 }}><Plus size={13} /> {t}</div>
                <div style={muted}>{d}</div>
              </button>
            ))}
          </div>
        </div>
      ) : grouped.map((g) => (
        <div key={g.group} className="glass-panel mb-4">
          <div className="table-header"><h3>{g.name}</h3>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }} onClick={() => openAdd(g.group)}><Plus size={13} /> Add</button>
          </div>
          <div className="table-scroll">
            <table className="data-table" style={{ minWidth: 640 }}>
              <thead><tr><th>Account</th><th style={num}>Opening</th><th style={num}>Balance now</th><th>{g.group === 'cc' ? 'Limit' : g.group === 'fixed-assets' ? 'Depreciation' : ''}</th><th className="col-center">Actions</th></tr></thead>
              <tbody>
                {g.items.map((a) => {
                  const bal = balances[`acc:${a.id}`] || 0;
                  const used = Math.max(0, -bal);
                  return (
                    <tr key={a.id}>
                      <td>
                        <div className="font-medium">{a.name}</div>
                        <div style={muted}>{[a.accountNumber, a.interestRate ? `${a.interestRate}% interest` : '', a.note].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td style={num}>{a.opening ? `${formatCurrency(a.opening)} ${a.openingSide}` : '-'}{a.asOn && a.opening ? <div style={muted}>on {a.asOn}</div> : null}</td>
                      <td style={{ ...num, fontWeight: 600 }}>{drCr(bal)}</td>
                      <td style={{ minWidth: 180 }}>
                        {g.group === 'cc' && (
                          <>
                            <div style={{ fontSize: '0.8rem' }}>{formatCurrency(a.limit || 0)} · used {formatCurrency(used)}</div>
                            <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', margin: '3px 0' }}>
                              <div style={{ width: `${a.limit ? Math.min(100, (used / a.limit) * 100) : 0}%`, height: '100%', background: used > (a.limit || 0) ? 'var(--danger)' : 'var(--primary)' }} />
                            </div>
                            <div style={{ ...muted, color: used > (a.limit || 0) ? 'var(--danger)' : undefined }}>{used > (a.limit || 0) ? `Over the limit by ${formatCurrency(used - (a.limit || 0))}` : `Available ${formatCurrency(Math.max(0, (a.limit || 0) - used))}`}</div>
                          </>
                        )}
                        {g.group === 'fixed-assets' && (
                          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }} onClick={() => addDepreciation(a)}>
                            <Calculator size={13} /> {a.depRate ? `${a.depRate}% this year` : 'Add depreciation'}
                          </button>
                        )}
                      </td>
                      <td>
                        <div className="table-actions">
                          <button className="icon-btn icon-btn-blue" title="Ledger" aria-label={`Ledger of ${a.name}`} onClick={() => openLedger(`acc:${a.id}`)}><BookOpen size={15} /></button>
                          <button className="icon-btn" title="Edit" aria-label={`Edit ${a.name}`} onClick={() => openEdit(a)}><Edit3 size={15} /></button>
                          <button className="icon-btn icon-btn-red" title="Delete" aria-label={`Delete ${a.name}`} onClick={() => remove(a)}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {data && accounts.length > 0 && (
        <p style={{ ...muted, padding: '0 0.25rem' }}>
          Money in and out of these accounts (a loan instalment, interest, cash put into the CC account, capital brought in) is entered on the <a href="#" onClick={(e) => { e.preventDefault(); onOpenView?.('vouchers'); }}>Vouchers</a> screen.
          A CC / OD account shows Cr when you have drawn on it: that is what you owe the bank.
        </p>
      )}

      {form && (
        <div className="modal-overlay" onClick={() => setForm(null)}>
          <form className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="section-title" style={{ margin: 0 }}>{form.id ? 'Edit account' : 'Add account'} <HelpButton title="Accounts" doc="accounts#add" size={15} /></h3>
              <button type="button" className="icon-btn" onClick={() => setForm(null)} aria-label="Close"><X size={18} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={label} htmlFor="acc-group">What kind of account</label>
                <select id="acc-group" className="form-input" value={form.group} onChange={set('group')}>
                  {ACCOUNT_GROUP_CHOICES.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={label} htmlFor="acc-name">Name *</label>
                <input id="acc-name" className="form-input" value={form.name} onChange={set('name')} autoFocus
                  placeholder={{ capital: 'Capital - Ramesh Ganatra', cc: 'SBI CC account', 'secured-loans': 'HDFC vehicle loan', 'unsecured-loans': 'Loan from Mahesh bhai', 'fixed-assets': 'Shop furniture', 'loans-advances': 'Loan to Suresh', deposits: 'Shop rent deposit' }[form.group] || 'Account name'} />
              </div>
              <div>
                <label style={label} htmlFor="acc-open">Opening balance</label>
                <input id="acc-open" type="number" min="0" step="0.01" className="form-input" value={form.opening} onChange={set('opening')} placeholder="0.00" />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={label} htmlFor="acc-side">Dr / Cr</label>
                  <select id="acc-side" className="form-input" value={form.openingSide} onChange={set('openingSide')}>
                    <option value="Dr">Dr (you have / are owed)</option>
                    <option value="Cr">Cr (you owe)</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={label} htmlFor="acc-ason">As on</label>
                <input id="acc-ason" type="date" className="form-input" value={form.asOn} onChange={set('asOn')} />
              </div>
              <div>
                <label style={label} htmlFor="acc-no">Account / loan number</label>
                <input id="acc-no" className="form-input" value={form.accountNumber} onChange={set('accountNumber')} placeholder="Optional" />
              </div>
              {form.group === 'cc' && (
                <div>
                  <label style={label} htmlFor="acc-limit">Sanctioned limit</label>
                  <input id="acc-limit" type="number" min="0" step="1" className="form-input" value={form.limit} onChange={set('limit')} placeholder="500000" />
                </div>
              )}
              {['cc', 'secured-loans', 'unsecured-loans', 'loans-advances'].includes(form.group) && (
                <div>
                  <label style={label} htmlFor="acc-rate">Interest rate (% a year)</label>
                  <input id="acc-rate" type="number" min="0" step="0.01" className="form-input" value={form.interestRate} onChange={set('interestRate')} placeholder="Optional" />
                </div>
              )}
              {form.group === 'fixed-assets' && (
                <div>
                  <label style={label} htmlFor="acc-dep">Depreciation rate (% a year, WDV)</label>
                  <input id="acc-dep" type="number" min="0" max="100" step="0.01" className="form-input" value={form.depRate} onChange={set('depRate')} placeholder="10 for furniture, 15 for vehicles" />
                </div>
              )}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={label} htmlFor="acc-note">Note</label>
                <input id="acc-note" className="form-input" value={form.note} onChange={set('note')} placeholder="Optional" />
              </div>
            </div>
            <p style={{ ...muted, marginTop: '0.6rem' }}>
              The opening balance is the amount on your last balance sheet (or on the day you start). Capital, loans taken and a drawn CC account are Cr; assets, loans given and deposits are Dr.
            </p>
            {warning && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{warning}</p>}
            <div className="flex gap-2" style={{ justifyContent: 'flex-end', marginTop: '0.75rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary"><Save size={16} /> Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

