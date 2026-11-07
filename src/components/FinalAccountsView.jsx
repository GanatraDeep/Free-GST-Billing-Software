// Divtech Hisaab - Final accounts: trial balance, trading and profit & loss
// account and balance sheet for a financial year, the year-end checklist,
// closing the year, and the CA pack (one Excel file with every statement,
// book, ledger and register). Figures: utils/ledgers.js; pack: utils/caPack.js.
import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Lock, Unlock, CheckCircle, AlertTriangle, Download, BookOpen } from 'lucide-react';
import { exportAllData } from '../store';
import { formatCurrency, getFYOptions } from '../utils';
import { trialBalance, profitAndLoss, balanceSheet, accountBalances, ACCOUNT_GROUPS, side, openingStockWarnings, STOCK_METHODS, stockMethodName } from '../utils/ledgers';
import { tradingBook, pnlBook, pnlModern, balanceSheetBook, balanceSheetModern, trialBalanceBook, bookExportRows, modernExportRows } from '../utils/statements';
import { getStockMethod, setStockMethod } from '../utils/stockMethod';
import { caPackSheets } from '../utils/caPack';
import { buildWorkbook } from '../utils/xlsx';
import { openLedger } from '../utils/openLedger';
import useBooks from './useBooks';
import { getClosedYears, setYearClosed, closedYearsOf } from './useClosedYears';
import HelpButton from './HelpButton';
import TableExport from './TableExport';
import { toast } from './Toast';
import { confirmAction } from './ConfirmModal';

const TABS = [['tb', 'Trial balance'], ['trading', 'Trading account'], ['pl', 'Profit & loss'], ['bs', 'Balance sheet'], ['ye', 'Year end']];
const VIEW_KEY = 'divtech_finalAccountsView';
const readView = () => { try { return localStorage.getItem(VIEW_KEY) === 'modern' ? 'modern' : 'book'; } catch { return 'book'; } };
const showDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const right = { textAlign: 'right', whiteSpace: 'nowrap' };
const muted = { color: 'var(--text-muted)', fontSize: '0.8rem' };
const money = (v) => formatCurrency(v);
const save = (bytes, name, type) => {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
// Ledger ids the statements can open (opening stock and earlier profit cannot).
const canOpen = (id) => id && !['pl-earlier', 'pl-period', 'closing-stock', 'stock', 'stock-open'].includes(id);

export default function FinalAccountsView({ onOpenView }) {
  const { data, profile } = useBooks();
  const fyOptions = useMemo(() => getFYOptions(6), []);
  const [fy, setFy] = useState(fyOptions[0].value);
  const [tab, setTab] = useState('tb');
  const [closed, setClosed] = useState({});
  // Divtech Hisaab - any dates, as in Tally / Miracle: the profit & loss for
  // from -> to and every balance as on the "to" date. A financial year is the
  // quick choice; the year end and closing always work on a whole year.
  const [custom, setCustom] = useState(false);
  const [dates, setDates] = useState(() => ({ from: fyOptions[0].from, to: fyOptions[0].to }));
  // Book view (T-form, debit left / credit right) or modern (vertical).
  const [view, setViewState] = useState(readView);
  const setView = (v) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* blocked */ } };
  const [method, setMethod] = useState(getStockMethod);
  const fyPeriod = fyOptions.find((f) => f.value === fy) || fyOptions[0];
  const range = custom && dates.from && dates.to && dates.from <= dates.to ? { from: dates.from, to: dates.to } : { from: fyPeriod.from, to: fyPeriod.to };
  // The year the "to" date falls in: for the year end tab and closing.
  const period = custom ? (fyOptions.find((f) => range.to >= f.from && range.to <= f.to) || fyPeriod) : fyPeriod;
  const fyShort = period.label.replace(/^FY /, '');
  const rangeLabel = custom ? `${showDate(range.from)} to ${showDate(range.to)}` : period.label;

  useEffect(() => { if (profile) getClosedYears().then((all) => setClosed(closedYearsOf(all, profile))).catch(() => {}); }, [profile]);

  const tb = useMemo(() => (data ? trialBalance(data, range) : null), [data, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const pl = useMemo(() => (data ? profitAndLoss(data, range) : null), [data, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  // Divtech Hisaab - opening stock with no purchase price (profit estimated).
  const stockWarn = useMemo(() => (data ? openingStockWarnings(data) : []), [data]);
  const bs = useMemo(() => (data ? balanceSheet(data, range) : null), [data, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const subtitle = [profile?.businessName, profile?.gstin && `GSTIN ${profile.gstin}`, rangeLabel].filter(Boolean).join(', ');
  const fileTag = `${(profile?.businessName || 'Business').replace(/[^\w]+/g, '-')}-${custom ? `${range.from}-to-${range.to}` : fyShort}`;
  const changeMethod = (m) => { setMethod(m); setStockMethod(m); toast(`Closing stock now valued by ${stockMethodName(m)}`, 'success'); };
  const stockNote = `Closing stock is valued at cost (without GST) by the ${stockMethodName(method)} method.`;

  const downloadPack = () => {
    const sheets = caPackSheets(data, { ...range, profile, title: `Accounts for ${rangeLabel}` });
    save(buildWorkbook(sheets), `CA-pack-${fileTag}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    toast(`CA pack for ${rangeLabel} downloaded: ${sheets.length} sheets`, 'success');
  };
  const downloadBackup = async () => {
    try {
      const json = await exportAllData();
      save(json, `divtech-hisaab-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
      toast('Full backup downloaded', 'success');
    } catch { toast('Could not make the backup', 'error'); }
  };

  // Year-end checks.
  const checks = useMemo(() => {
    if (!data || !tb) return [];
    const bal = accountBalances(data, period.to);
    const inFy = (v) => v.date >= period.from && v.date <= period.to;
    const fixed = (data.accounts || []).filter((a) => a.group === 'fixed-assets' && Math.abs(bal[`acc:${a.id}`] || 0) > 0.005);
    const depDone = fixed.filter((a) => (data.vouchers || []).some((v) => inFy(v) && (v.lines || []).some((l) => l.account === `acc:${a.id}` && l.cr > 0) && (v.lines || []).some((l) => l.account === 'expense:Depreciation')));
    const ccs = (data.accounts || []).filter((a) => ['cc', 'secured-loans', 'unsecured-loans'].includes(a.group) && Math.abs(bal[`acc:${a.id}`] || 0) > 0.005);
    const interestDone = ccs.filter((a) => (data.vouchers || []).some((v) => inFy(v) && (v.lines || []).some((l) => l.account === `acc:${a.id}`) && (v.lines || []).some((l) => /^expense:interest/i.test(l.account))));
    const capital = (data.accounts || []).some((a) => a.group === 'capital');
    const openingDiff = bal['opening-diff'] || 0;
    const suspense = bal.suspense || 0;
    const cash = bal.cash || 0;
    const negativeStock = tb.stockLines.filter((l) => l.qty < -0.0005);
    return [
      { ok: Math.abs(tb.difference) < 0.005, title: 'Trial balance agrees', detail: Math.abs(tb.difference) < 0.005 ? `Debit ${money(tb.dr)} = Credit ${money(tb.cr)}` : `Off by ${money(tb.difference)}` },
      { ok: capital, title: 'Capital account entered', detail: capital ? 'The owner\'s capital is in Accounts.' : 'Add the capital account (Accounts → Capital) with the opening balance from your last balance sheet.', view: 'accounts' },
      { ok: Math.abs(openingDiff) < 0.5, title: 'Opening balances match', detail: Math.abs(openingDiff) < 0.5 ? 'No difference in opening balances.' : `Difference in opening balances: ${money(Math.abs(openingDiff))} ${side(openingDiff)}. Opening cash, bank, stock, parties and accounts do not add up to the capital: check the capital account's opening balance.`, ledger: 'opening-diff' },
      { ok: Math.abs(suspense) < 0.5, title: 'No payments left in suspense', detail: Math.abs(suspense) < 0.5 ? 'Every payment is in cash, bank or an account.' : `${money(Math.abs(suspense))} ${side(suspense)} was paid or received in mode "Other" or only marked paid. Open the Suspense ledger and correct those payments (or move them with a journal voucher).`, ledger: 'suspense' },
      { ok: cash >= -0.005, title: 'Cash in hand is not negative', detail: cash >= -0.005 ? `Cash on ${period.to}: ${money(cash)}. Count the cash and match it.` : `Cash shows ${money(cash)} on ${period.to}: an entry is missing (cash sale, withdrawal) or wrong.`, ledger: 'cash' },
      { ok: true, info: true, title: 'Bank matches the bank statement', detail: `Bank book on ${period.to}: ${money(bal.bank || 0)} ${side(bal.bank || 0)}. Tick it against the statement; add bank charges and interest in the Bank book.`, ledger: 'bank' },
      { ok: negativeStock.length === 0, title: 'Stock counted', detail: negativeStock.length ? `${negativeStock.length} item${negativeStock.length === 1 ? '' : 's'} below zero (${negativeStock.slice(0, 3).map((l) => l.name).join(', ')}): a purchase is missing, or a sale named the item differently.` : `Closing stock ${money(tb.closingStock)}. Count the godown and correct stock in Products if it differs.`, view: 'inventory' },
      { ok: fixed.length === depDone.length, title: 'Depreciation entered', detail: fixed.length === 0 ? 'No fixed assets in Accounts.' : fixed.length === depDone.length ? 'Entered on every fixed asset.' : `Not yet on ${fixed.filter((a) => !depDone.includes(a)).map((a) => a.name).join(', ')} (Accounts → the asset's depreciation button).`, view: 'accounts' },
      { ok: ccs.length === interestDone.length, title: 'Interest on CC and loans entered', detail: ccs.length === 0 ? 'No CC or loan accounts.' : ccs.length === interestDone.length ? 'Interest is entered on each.' : `No interest entry this year on ${ccs.filter((a) => !interestDone.includes(a)).map((a) => a.name).join(', ')}. Enter it as a journal voucher (Interest Dr, the account Cr).`, view: 'vouchers' },
    ];
  }, [data, tb, fy]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleClose = async () => {
    const isClosed = !!closed[fyShort];
    if (!isClosed && !(await confirmAction({
      title: `Close ${period.label}?`,
      message: 'Nothing is deleted or locked. After closing, saving or deleting an entry dated in this year asks first, so the figures given to the CA do not change by mistake. The closing balances carry into the next year by themselves. Download the CA pack and a backup first.',
      confirmLabel: 'Close the year',
    }))) return;
    await setYearClosed(profile, fyShort, !isClosed);
    setClosed(closedYearsOf(await getClosedYears(), profile));
    toast(isClosed ? `${period.label} reopened` : `${period.label} closed`, 'success');
  };

  const nameCell = (id, name) => (canOpen(id)
    ? <a href="#" onClick={(e) => { e.preventDefault(); openLedger(id); }} style={{ color: 'inherit' }} title="Open the ledger">{name}</a>
    : name);

  return (
    <div className="dashboard-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Final accounts <HelpButton title="Final accounts" doc="final-accounts" size={16} /></h1>
          <p className="page-subtitle">Trial balance, trading account, profit &amp; loss, balance sheet and the year end, for a year or any dates</p>
        </div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={downloadPack} disabled={!data}><FileSpreadsheet size={16} /> CA pack (Excel)</button>
        </div>
      </div>

      <div className="glass-panel p-4 mb-4">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label className="form-label" htmlFor="fa-period" style={{ fontSize: '0.72rem' }}>Period</label>
            <select id="fa-period" className="filter-select" value={custom ? 'custom' : fy} onChange={(e) => {
              if (e.target.value === 'custom') { setCustom(true); setDates({ from: fyPeriod.from, to: fyPeriod.to }); } else { setCustom(false); setFy(e.target.value); }
            }}>
              {fyOptions.map((f) => <option key={f.value} value={f.value}>{f.label}{closed[f.label.replace(/^FY /, '')] ? ' (closed)' : ''}</option>)}
              <option value="custom">Choose dates (from / to)</option>
            </select>
          </div>
          {custom && <>
            <div><label className="form-label" htmlFor="fa-from" style={{ fontSize: '0.72rem' }}>From</label>
              <input id="fa-from" type="date" className="form-input" value={dates.from} onChange={(e) => setDates((d) => ({ ...d, from: e.target.value }))} /></div>
            <div><label className="form-label" htmlFor="fa-to" style={{ fontSize: '0.72rem' }}>To (balances as on)</label>
              <input id="fa-to" type="date" className="form-input" value={dates.to} onChange={(e) => setDates((d) => ({ ...d, to: e.target.value }))} /></div>
          </>}
          <div>
            <label className="form-label" htmlFor="fa-view" style={{ fontSize: '0.72rem' }}>View</label>
            <select id="fa-view" className="filter-select" value={view} onChange={(e) => setView(e.target.value)}>
              <option value="book">Book (debit left, credit right)</option>
              <option value="modern">Modern (one column)</option>
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="fa-method" style={{ fontSize: '0.72rem' }}>Closing stock method</label>
            <select id="fa-method" className="filter-select" value={method} onChange={(e) => changeMethod(e.target.value)}>
              {STOCK_METHODS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </div>
        </div>
        {custom && dates.from > dates.to && <p style={{ ...muted, color: 'var(--danger)', margin: '0.5rem 0 0' }}>"From" is after "To": showing {fyPeriod.label}.</p>}
      </div>

      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {TABS.map(([id, t]) => <button key={id} type="button" className={`btn ${tab === id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(id)} style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>{t}</button>)}
        {closed[fyShort] && <span className="type-badge" style={{ alignSelf: 'center' }}><Lock size={11} /> Closed on {new Date(closed[fyShort].closedOn).toLocaleDateString('en-IN')}</span>}
      </div>

      {!data ? <div className="glass-panel"><div className="empty-state"><p>Loading...</p></div></div> : (
        <>
          {tab === 'tb' && (
            <div className="glass-panel">
              <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3>Trial balance <span style={muted}>· as on {showDate(range.to)}{custom ? ` (income and expenses from ${showDate(range.from)})` : ''}</span>
                  {Math.abs(tb.difference) >= 0.005 && <span style={{ ...muted, color: 'var(--danger)', display: 'block' }}>Does not agree: off by {money(tb.difference)}</span>}</h3>
                <TableExport title={`Trial balance as on ${showDate(range.to)}`} subtitle={subtitle} filename={`Trial-balance-${fileTag}`} headers={['Particulars', 'Debit', 'Credit']}
                  rows={[...trialBalanceBook(tb, (g) => ACCOUNT_GROUPS[g]?.name || g).map((l) => [`${l.indent ? '   ' : ''}${l.label}`, l.dr || '', l.cr || '']), ['Total', tb.dr, tb.cr]]} />
              </div>
              <div className="table-scroll">
                {view === 'book' ? (
                  <table className="data-table" style={{ minWidth: 620 }}>
                    <thead><tr><th>Particulars</th><th style={right}>Debit (₹)</th><th style={right}>Credit (₹)</th></tr></thead>
                    <tbody>
                      {trialBalanceBook(tb, (g) => ACCOUNT_GROUPS[g]?.name || g).map((l, i) => (
                        <tr key={`${l.label}-${i}`} style={l.head ? { fontWeight: 700, background: 'var(--bg-secondary, rgba(0,0,0,0.03))' } : undefined}>
                          <td style={{ paddingLeft: l.indent ? '1.75rem' : undefined }}>{l.head ? l.label : nameCell(l.id, l.label)}</td>
                          <td style={right}>{l.dr ? money(l.dr) : ''}</td>
                          <td style={right}>{l.cr ? money(l.cr) : ''}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}><td>Total</td><td style={right}>{money(tb.dr)}</td><td style={right}>{money(tb.cr)}</td></tr>
                    </tbody>
                  </table>
                ) : (
                  <table className="data-table" style={{ minWidth: 620 }}>
                    <thead><tr><th>Account</th><th>Group</th><th style={right}>Debit</th><th style={right}>Credit</th></tr></thead>
                    <tbody>
                      {tb.rows.map((r) => (
                        <tr key={r.id}>
                          <td className="font-medium">{nameCell(r.id, r.name)}</td>
                          <td style={muted}>{ACCOUNT_GROUPS[r.group]?.name || r.group}</td>
                          <td style={right}>{r.net > 0 ? money(r.net) : ''}</td>
                          <td style={right}>{r.net < 0 ? money(-r.net) : ''}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 700 }}><td>Total</td><td /><td style={right}>{money(tb.dr)}</td><td style={right}>{money(tb.cr)}</td></tr>
                    </tbody>
                  </table>
                )}
              </div>
              <p style={{ ...muted, padding: '0.75rem 1rem' }}>Closing stock on {showDate(range.to)}: {money(tb.closingStock)}. {stockNote} Income and expense accounts show {custom ? 'the dates picked' : 'this year'} only; profit before that is in one line. Click an account to open its ledger.</p>
            </div>
          )}

          {['trading', 'pl', 'bs'].includes(tab) && stockWarn.length > 0 && (
            <div className="notice notice-warning" style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
              <strong>Opening stock without an opening stock cost:</strong>{' '}
              {stockWarn.map((w) => `${w.name} ${w.qty} ${w.unit || ''} ${w.how === 'first-purchase' ? `valued at the first purchase rate ${formatCurrency(w.rate)}` : 'valued at zero (never bought)'}`).join('; ')}.
              Stock and profit are only as right as this cost: open <b>Products</b>, edit each one (or use Bulk edit) and enter its <b>Opening stock cost</b> (cost per unit without GST on the day you started).
            </div>
          )}
          {tab === 'trading' && (
            <Statement title="Trading account" period={`for the period ${showDate(range.from)} to ${showDate(range.to)}`} subtitle={subtitle} fileTag={fileTag} view={view} nameCell={nameCell}
              book={tradingBook(pl)} modern={pnlModern(pl).slice(0, pnlModern(pl).findIndex((l) => l.label === 'Profit & loss account'))}
              note={<>{pl.grossProfit >= 0 ? 'Gross profit' : 'Gross loss'}: <strong>{money(Math.abs(pl.grossProfit))}</strong>. Sales and purchases are without GST. {stockNote}</>} />
          )}

          {tab === 'pl' && (
            <Statement title={view === 'book' ? 'Profit & loss account' : 'Trading and profit & loss account'} period={`for the period ${showDate(range.from)} to ${showDate(range.to)}`} subtitle={subtitle} fileTag={fileTag} view={view} nameCell={nameCell}
              book={pnlBook(pl)} modern={pnlModern(pl)} before={view === 'book' ? tradingBook(pl) : null}
              note={<>{pl.netProfit >= 0 ? 'Net profit' : 'Net loss'} for {rangeLabel}: <strong>{money(Math.abs(pl.netProfit))}</strong>, transferred to the capital account. Sales and purchases are without GST; GST is in the duties and taxes accounts. {stockNote}</>} />
          )}

          {tab === 'bs' && (
            <Statement title="Balance sheet" period={`as on ${showDate(range.to)}`} subtitle={subtitle} fileTag={fileTag} view={view} nameCell={nameCell}
              book={balanceSheetBook(bs)} modern={balanceSheetModern(bs)}
              warn={Math.abs(bs.difference) >= 0.005 ? `Does not agree: off by ${money(bs.difference)}` : ''}
              note={<>{stockNote} Customers who paid in advance and suppliers paid in advance are shown on the other side. Profit up to {showDate(range.to)} is in the capital account.</>} />
          )}

          {tab === 'ye' && (
            <div className="glass-panel p-6">
              <h3 className="section-title" style={{ marginTop: 0 }}>Year end for {period.label} <HelpButton title="Year end" doc="final-accounts#year-end" size={16} /></h3>
              <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {checks.map((c) => (
                  <li key={c.title} style={{ display: 'flex', gap: '0.6rem', padding: '0.6rem 0', borderBottom: '1px solid var(--border)' }}>
                    {c.ok ? <CheckCircle size={18} style={{ color: c.info ? 'var(--text-muted)' : 'var(--success)', flexShrink: 0 }} /> : <AlertTriangle size={18} style={{ color: 'var(--warning, #d97706)', flexShrink: 0 }} />}
                    <div style={{ flex: 1 }}>
                      <div className="font-medium">{c.title}</div>
                      <div style={muted}>{c.detail}</div>
                    </div>
                    {c.ledger && <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', alignSelf: 'center' }} onClick={() => openLedger(c.ledger)}><BookOpen size={13} /> Ledger</button>}
                    {c.view && <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', alignSelf: 'center' }} onClick={() => onOpenView?.(c.view)}>Open</button>}
                  </li>
                ))}
              </ol>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                <button type="button" className="btn btn-primary" onClick={downloadPack}><FileSpreadsheet size={16} /> CA pack (Excel)</button>
                <button type="button" className="btn btn-secondary" onClick={downloadBackup}><Download size={16} /> Full backup (JSON)</button>
                <button type="button" className="btn btn-secondary" onClick={toggleClose} style={{ marginLeft: 'auto' }}>
                  {closed[fyShort] ? <><Unlock size={16} /> Reopen {period.label}</> : <><Lock size={16} /> Close {period.label}</>}
                </button>
              </div>
              <p style={{ ...muted, marginTop: '0.75rem' }}>
                The CA pack has the trial balance, profit &amp; loss, balance sheet, day book, cash and bank books, every customer, supplier and account ledger, debtors, creditors, stock and every register, one sheet each.
                Closing balances carry into the next year by themselves: there is nothing to copy.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Statement({ title, period, subtitle, fileTag, view, nameCell, book, modern, before, note, warn }) {
  const headers = [book.leftTitle ? `${book.leftTitle}` : 'Dr. Particulars', 'Amount (₹)', book.rightTitle ? `${book.rightTitle}` : 'Cr. Particulars', 'Amount (₹)'];
  const exportRows = view === 'book'
    ? [...(before ? [[before.title, '', '', ''], ...bookExportRows(before), ['', '', '', '']] : []), ...(before ? [[book.title, '', '', '']] : []), ...bookExportRows(book)]
    : modernExportRows(modern);
  return (
    <div className="glass-panel">
      <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3>{title} <span style={muted}>· {period}</span>{warn && <span style={{ ...muted, color: 'var(--danger)', display: 'block' }}>{warn}</span>}</h3>
        <TableExport title={`${title} ${period}`} subtitle={subtitle} filename={`${title.replace(/[^\w]+/g, '-')}-${fileTag}`}
          headers={view === 'book' ? headers : ['Particulars', 'Amount (₹)']} rows={exportRows} landscape={view === 'book'} />
      </div>
      <div style={{ padding: '1rem' }}>
        {view === 'book' ? (
          <>
            {before && <BookTable book={before} nameCell={nameCell} />}
            <BookTable book={book} nameCell={nameCell} />
          </>
        ) : <ModernTable rows={modern} nameCell={nameCell} />}
      </div>
      {note && <p style={{ ...muted, padding: '0 1rem 1rem', margin: 0 }}>{note}</p>}
    </div>
  );
}

// T-form: debit / liabilities on the left, credit / assets on the right, both
// sides padded to the same length so the totals line up as in a book.
function BookTable({ book, nameCell }) {
  const n = Math.max(book.left.length, book.right.length);
  const sideCells = (l, key) => {
    if (!l) return [<td key={`${key}a`} />, <td key={`${key}b`} />, <td key={`${key}c`} style={{ borderRight: key === 'L' ? '2px solid var(--border)' : undefined }} />];
    const inner = l.indent && !l.head;
    return [
      <td key={`${key}a`} style={{ paddingLeft: l.indent ? '1.5rem' : undefined, fontWeight: l.head || l.bold ? 700 : 400 }}>{l.head ? l.label : nameCell(l.id, l.label)}</td>,
      <td key={`${key}b`} style={{ ...right, color: 'var(--text-secondary)' }}>{inner ? money(l.amount) : ''}</td>,
      <td key={`${key}c`} style={{ ...right, fontWeight: l.head || l.bold ? 700 : 400, borderRight: key === 'L' ? '2px solid var(--border)' : undefined }}>{inner ? '' : (l.head && !l.groupTotal ? '' : money(l.amount))}</td>,
    ];
  };
  return (
    <div className="table-scroll" style={{ marginBottom: '1rem' }}>
      <table className="data-table" style={{ minWidth: 820 }}>
        <thead>
          {book.title && <tr><th colSpan={6} style={{ textAlign: 'center', fontSize: '0.95rem' }}>{book.title}</th></tr>}
          <tr>
            <th>{book.leftTitle || 'Dr.'}</th><th style={right} /><th style={{ ...right, borderRight: '2px solid var(--border)' }}>₹</th>
            <th>{book.rightTitle || 'Cr.'}</th><th style={right} /><th style={right}>₹</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: n }, (_, i) => <tr key={i}>{sideCells(book.left[i], 'L')}{sideCells(book.right[i], 'R')}</tr>)}
          <tr style={{ fontWeight: 800, borderTop: '2px solid var(--border)', borderBottom: '3px double var(--border)' }}>
            <td>Total</td><td /><td style={{ ...right, borderRight: '2px solid var(--border)' }}>{money(book.totalLeft)}</td>
            <td>Total</td><td /><td style={right}>{money(book.totalRight)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ModernTable({ rows, nameCell }) {
  return (
    <table className="data-table" style={{ minWidth: 0, maxWidth: 720 }}>
      <thead><tr><th>Particulars</th><th style={right}>₹</th><th style={right}>₹</th></tr></thead>
      <tbody>
        {rows.map((l, i) => (
          <tr key={`${l.label}-${i}`} style={l.head && !l.groupTotal ? { background: 'var(--bg-secondary, rgba(0,0,0,0.03))' } : l.total ? { borderTop: '1px solid var(--border)' } : undefined}>
            <td style={{ paddingLeft: `${0.75 + (l.indent || 0) * 1.25}rem`, fontWeight: l.head || l.bold || l.total ? 700 : 400 }}>{l.head ? l.label : nameCell(l.id, l.label)}</td>
            <td style={{ ...right, color: 'var(--text-secondary)' }}>{!l.head && !l.total ? money(l.amount) : ''}</td>
            <td style={{ ...right, fontWeight: 700 }}>{l.total || l.groupTotal ? money(l.amount) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
