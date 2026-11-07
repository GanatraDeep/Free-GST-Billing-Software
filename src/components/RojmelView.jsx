// Divtech Hisaab - Rojmel (day book): money in (jama) and out (udhar) day by
// day with each day's opening and closing balance, for Cash, Bank, a bank / CC
// account or all of them together; and a day-wise summary of the business.
// Rules: utils/rojmel.js (built from the same postings as the ledgers).
import { useMemo, useState } from 'react';
import { BookOpenCheck, ChevronDown, ChevronRight } from 'lucide-react';
import { formatCurrency, localToday, parseLocalDate } from '../utils';
import { periodRange } from '../utils/cashBook';
import { postings } from '../utils/ledgers';
import { rojmel, dayWiseSummary, rojmelAccounts, allMoneyIds } from '../utils/rojmel';
import useBooks from './useBooks';
import HelpButton from './HelpButton';
import TableExport from './TableExport';

const ALL = '__all__';
const PERIODS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['month', 'This month'], ['lastMonth', 'Last month'], ['fy', 'This financial year'], ['custom', 'Choose dates']];
const shift = (iso, days) => { const d = parseLocalDate(iso); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const showDate = (d) => (d ? parseLocalDate(d).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '(no date)');
const money = (n) => (Math.abs(n) < 0.005 ? '-' : formatCurrency(n));
const bal = (n) => `${formatCurrency(Math.abs(n))}${n < -0.005 ? ' Cr' : ''}`;

export default function RojmelView() {
  const { data, profile } = useBooks();
  const [tab, setTab] = useState('rojmel');
  const [period, setPeriod] = useState('today');
  const [custom, setCustom] = useState(() => ({ from: localToday(), to: localToday() }));
  const [account, setAccount] = useState('cash');
  const [open, setOpen] = useState(() => new Set());
  const [expandAll, setExpandAll] = useState(true);

  const today = localToday();
  const range = period === 'today' ? { from: today, to: today }
    : period === 'yesterday' ? { from: shift(today, -1), to: shift(today, -1) }
      : period === 'custom' ? custom : periodRange(period);
  const accounts = useMemo(() => (data ? rojmelAccounts(data) : []), [data]);
  const all = useMemo(() => (data ? postings(data) : []), [data]);
  const ids = account === ALL ? allMoneyIds(data || {}) : [account];
  const book = useMemo(() => (data ? rojmel(data, ids, { ...range, all }) : null), [data, all, account, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useMemo(() => (data ? dayWiseSummary(data, { ...range, all }) : null), [data, all, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const accountLabel = account === ALL ? 'Cash + all banks' : (accounts.find((a) => a.id === account)?.name || account);
  const periodLabel = range.from === range.to ? showDate(range.from) : `${showDate(range.from)} to ${showDate(range.to)}`;
  const subtitle = [profile?.businessName, profile?.gstin, periodLabel].filter(Boolean).join(', ');
  const isOpen = (d) => (expandAll ? !open.has(d) : open.has(d));
  const toggle = (d) => setOpen((s) => { const n = new Set(s); if (n.has(d)) n.delete(d); else n.add(d); return n; });
  const muted = { color: 'var(--text-muted)', fontSize: '0.8rem' };
  const right = { textAlign: 'right', whiteSpace: 'nowrap' };
  const label = { display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 };

  // Print / Excel: one line per entry under its day, with the day's totals.
  const exportRows = book ? [
    ['', 'Opening balance', '', '', '', '', book.opening],
    ...book.days.flatMap((d) => [
      ...d.entries.map((e) => [d.date, e.particulars, e.kind, e.ref, e.in || '', e.out || '', '']),
      [d.date, `Day total (opening ${d.opening})`, '', '', d.in, d.out, d.closing],
    ]),
    ['', 'Total for the period', '', '', book.totalIn, book.totalOut, book.closing],
  ] : [];
  const sumRows = summary ? [
    ...summary.rows.map((x) => [x.date, x.invoices, x.sales, x.gstOnSales, x.bills, x.purchases, x.expenses, x.cashIn, x.cashOut, x.cashClosing, x.bankIn, x.bankOut, x.bankClosing]),
    ['Total', summary.totals.invoices, summary.totals.sales, summary.totals.gstOnSales, summary.totals.bills, summary.totals.purchases, summary.totals.expenses, summary.totals.cashIn, summary.totals.cashOut, summary.cashClosing, summary.totals.bankIn, summary.totals.bankOut, summary.bankClosing],
  ] : [];

  return (
    <div className="dashboard-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rojmel (day book) <HelpButton title="Rojmel" doc="cash-book#rojmel" size={16} /></h1>
          <p className="page-subtitle">Jama and udhar day by day with each day's opening and closing, and a day-wise summary</p>
        </div>
      </div>

      <div className="glass-panel p-4 mb-4">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="segmented" role="tablist" style={{ display: 'flex', gap: 4 }}>
            <button type="button" role="tab" aria-selected={tab === 'rojmel'} className={`btn ${tab === 'rojmel' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('rojmel')}>Rojmel</button>
            <button type="button" role="tab" aria-selected={tab === 'summary'} className={`btn ${tab === 'summary' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('summary')}>Day-wise summary</button>
          </div>
          <div>
            <label style={label} htmlFor="rj-period">Dates</label>
            <select id="rj-period" className="filter-select" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIODS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </div>
          {period === 'custom' && <>
            <div><label style={label} htmlFor="rj-from">From</label>
              <input id="rj-from" type="date" className="form-input" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></div>
            <div><label style={label} htmlFor="rj-to">To</label>
              <input id="rj-to" type="date" className="form-input" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></div>
          </>}
          {tab === 'rojmel' && (
            <div>
              <label style={label} htmlFor="rj-account">Account</label>
              <select id="rj-account" className="filter-select" value={account} onChange={(e) => setAccount(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                <option value={ALL}>Cash + all banks</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {!data ? <div className="glass-panel"><div className="empty-state"><p>Loading...</p></div></div> : tab === 'rojmel' ? (
        <>
          <div className="stats-grid" style={{ marginBottom: '1rem' }}>
            <div className="stat-card"><div><p className="stat-label">Opening · {accountLabel}</p><h2 className="stat-value">{bal(book.opening)}</h2></div></div>
            <div className="stat-card"><div><p className="stat-label">Jama (in)</p><h2 className="stat-value" style={{ color: 'var(--success, #16a34a)' }}>{formatCurrency(book.totalIn)}</h2></div></div>
            <div className="stat-card"><div><p className="stat-label">Udhar (out)</p><h2 className="stat-value" style={{ color: '#dc2626' }}>{formatCurrency(book.totalOut)}</h2></div></div>
            <div className="stat-card"><div><p className="stat-label">Closing</p><h2 className="stat-value">{bal(book.closing)}</h2></div></div>
          </div>
          <div className="glass-panel">
            <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3>Rojmel · {accountLabel} <span style={muted}>· {periodLabel} · {book.days.length} day{book.days.length === 1 ? '' : 's'}</span></h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setExpandAll((v) => !v); setOpen(new Set()); }}>{expandAll ? 'Collapse all' : 'Expand all'}</button>
                <TableExport title={`Rojmel - ${accountLabel}`} filename={`Rojmel-${accountLabel}-${range.from}-${range.to}`} subtitle={subtitle}
                  headers={['Date', 'Particulars', 'Type', 'Ref', 'Jama (in)', 'Udhar (out)', 'Balance']} rows={exportRows} />
              </div>
            </div>
            {book.days.length === 0 ? (
              <div className="empty-state"><BookOpenCheck size={48} /><p>No money in or out on these dates. Opening and closing: {bal(book.opening)}.</p></div>
            ) : (
              <div className="table-scroll">
                <table className="data-table" style={{ minWidth: 760 }}>
                  <thead><tr><th>Date / particulars</th><th>Type</th><th style={right}>Jama (in)</th><th style={right}>Udhar (out)</th><th style={right}>Balance</th></tr></thead>
                  <tbody>
                    {book.days.map((d) => (
                      <RojmelDay key={d.date} day={d} open={isOpen(d.date)} onToggle={() => toggle(d.date)} right={right} muted={muted} />
                    ))}
                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border-color)' }}>
                      <td colSpan={2}>Total for the period</td>
                      <td style={right}>{formatCurrency(book.totalIn)}</td><td style={right}>{formatCurrency(book.totalOut)}</td><td style={right}>{bal(book.closing)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="glass-panel">
          <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3>Day-wise summary <span style={muted}>· {periodLabel}</span></h3>
            <TableExport title="Day-wise summary" filename={`Day-wise-summary-${range.from}-${range.to}`} subtitle={subtitle} landscape
              headers={['Date', 'Invoices', 'Sales (before GST)', 'GST on sales', 'Purchase bills', 'Purchases', 'Expenses', 'Cash in', 'Cash out', 'Cash closing', 'Bank in', 'Bank out', 'Bank closing']} rows={sumRows} />
          </div>
          <p style={{ ...muted, padding: '0 1rem' }}>Opening: cash {bal(summary.cashOpening)} · bank {bal(summary.bankOpening)}. Sales are net of credit notes, purchases net of returns. Bank includes your bank and CC accounts.</p>
          {summary.rows.length === 0 ? <div className="empty-state"><BookOpenCheck size={48} /><p>Nothing on these dates.</p></div> : (
            <div className="table-scroll">
              <table className="data-table" style={{ minWidth: 1100 }}>
                <thead><tr>
                  <th>Date</th><th style={right}>Sales</th><th style={right}>GST on sales</th><th style={right}>Purchases</th><th style={right}>Expenses</th>
                  <th style={right}>Cash in</th><th style={right}>Cash out</th><th style={right}>Cash closing</th><th style={right}>Bank in</th><th style={right}>Bank out</th><th style={right}>Bank closing</th>
                </tr></thead>
                <tbody>
                  {summary.rows.map((x) => (
                    <tr key={x.date}>
                      <td style={{ whiteSpace: 'nowrap' }}>{showDate(x.date)}</td>
                      <td style={right}>{money(x.sales)}{x.invoices > 0 && <div style={muted}>{x.invoices} invoice{x.invoices === 1 ? '' : 's'}</div>}</td>
                      <td style={right}>{money(x.gstOnSales)}</td>
                      <td style={right}>{money(x.purchases)}{x.bills > 0 && <div style={muted}>{x.bills} bill{x.bills === 1 ? '' : 's'}</div>}</td>
                      <td style={right}>{money(x.expenses)}</td>
                      <td style={right}>{money(x.cashIn)}</td><td style={right}>{money(x.cashOut)}</td><td style={{ ...right, fontWeight: 600 }}>{bal(x.cashClosing)}</td>
                      <td style={right}>{money(x.bankIn)}</td><td style={right}>{money(x.bankOut)}</td><td style={{ ...right, fontWeight: 600 }}>{bal(x.bankClosing)}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border-color)' }}>
                    <td>Total</td>
                    <td style={right}>{formatCurrency(summary.totals.sales)}<div style={muted}>{summary.totals.invoices} invoices</div></td>
                    <td style={right}>{formatCurrency(summary.totals.gstOnSales)}</td>
                    <td style={right}>{formatCurrency(summary.totals.purchases)}<div style={muted}>{summary.totals.bills} bills</div></td>
                    <td style={right}>{formatCurrency(summary.totals.expenses)}</td>
                    <td style={right}>{formatCurrency(summary.totals.cashIn)}</td><td style={right}>{formatCurrency(summary.totals.cashOut)}</td><td style={right}>{bal(summary.cashClosing)}</td>
                    <td style={right}>{formatCurrency(summary.totals.bankIn)}</td><td style={right}>{formatCurrency(summary.totals.bankOut)}</td><td style={right}>{bal(summary.bankClosing)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RojmelDay({ day, open, onToggle, right, muted }) {
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <>
      <tr style={{ background: 'var(--bg-secondary, rgba(0,0,0,0.03))', cursor: 'pointer' }} onClick={onToggle} aria-expanded={open}>
        <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}><Chevron size={14} style={{ verticalAlign: '-2px' }} /> {showDate(day.date)}</td>
        <td style={muted}>Opening {bal(day.opening)} · {day.entries.length} entr{day.entries.length === 1 ? 'y' : 'ies'}</td>
        <td style={{ ...right, fontWeight: 700 }}>{money(day.in)}</td>
        <td style={{ ...right, fontWeight: 700 }}>{money(day.out)}</td>
        <td style={{ ...right, fontWeight: 700 }}>{bal(day.closing)}</td>
      </tr>
      {open && day.entries.map((e) => (
        <tr key={e.key}>
          <td style={{ paddingLeft: '1.75rem' }}>{e.particulars}{e.ref && <div style={muted}>{e.ref}</div>}</td>
          <td style={muted}>{e.kind}</td>
          <td style={right}>{e.in ? formatCurrency(e.in) : ''}</td>
          <td style={right}>{e.out ? formatCurrency(e.out) : ''}</td>
          <td />
        </tr>
      ))}
    </>
  );
}
