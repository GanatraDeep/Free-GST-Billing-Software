// Divtech Hisaab - Final accounts: trial balance, trading and profit & loss
// account and balance sheet for a financial year, the year-end checklist,
// closing the year, and the CA pack (one Excel file with every statement,
// book, ledger and register). Figures: utils/ledgers.js; pack: utils/caPack.js.
import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Lock, Unlock, CheckCircle, AlertTriangle, Download, BookOpen } from 'lucide-react';
import { exportAllData } from '../store';
import { formatCurrency, getFYOptions } from '../utils';
import { trialBalance, profitAndLoss, balanceSheet, accountBalances, ACCOUNT_GROUPS, side } from '../utils/ledgers';
import { caPackSheets } from '../utils/caPack';
import { buildWorkbook } from '../utils/xlsx';
import { openLedger } from '../utils/openLedger';
import useBooks from './useBooks';
import { getClosedYears, setYearClosed, closedYearsOf } from './useClosedYears';
import HelpButton from './HelpButton';
import TableExport from './TableExport';
import { toast } from './Toast';
import { confirmAction } from './ConfirmModal';

const TABS = [['tb', 'Trial balance'], ['pl', 'Profit & loss'], ['bs', 'Balance sheet'], ['ye', 'Year end']];
const right = { textAlign: 'right', whiteSpace: 'nowrap' };
const muted = { color: 'var(--text-muted)', fontSize: '0.8rem' };
const money = (v) => formatCurrency(v);
const save = (bytes, name, type) => {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
// Ledger ids the statements can open (opening stock and earlier profit cannot).
const canOpen = (id) => id && !['pl-earlier', 'pl-period', 'closing-stock', 'stock'].includes(id);

export default function FinalAccountsView({ onOpenView }) {
  const { data, profile } = useBooks();
  const fyOptions = useMemo(() => getFYOptions(6), []);
  const [fy, setFy] = useState(fyOptions[0].value);
  const [tab, setTab] = useState('tb');
  const [closed, setClosed] = useState({});
  const period = fyOptions.find((f) => f.value === fy) || fyOptions[0];
  const range = { from: period.from, to: period.to };
  const fyShort = period.label.replace(/^FY /, '');

  useEffect(() => { if (profile) getClosedYears().then((all) => setClosed(closedYearsOf(all, profile))).catch(() => {}); }, [profile]);

  const tb = useMemo(() => (data ? trialBalance(data, range) : null), [data, fy]); // eslint-disable-line react-hooks/exhaustive-deps
  const pl = useMemo(() => (data ? profitAndLoss(data, range) : null), [data, fy]); // eslint-disable-line react-hooks/exhaustive-deps
  const bs = useMemo(() => (data ? balanceSheet(data, range) : null), [data, fy]); // eslint-disable-line react-hooks/exhaustive-deps

  const subtitle = [profile?.businessName, period.label].filter(Boolean).join(', ');
  const fileTag = `${(profile?.businessName || 'Business').replace(/[^\w]+/g, '-')}-${fyShort}`;

  const downloadPack = () => {
    const sheets = caPackSheets(data, { ...range, profile, title: `Accounts for ${period.label}` });
    save(buildWorkbook(sheets), `CA-pack-${fileTag}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    toast(`CA pack for ${period.label} downloaded: ${sheets.length} sheets`, 'success');
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
          <p className="page-subtitle">Trial balance, profit &amp; loss, balance sheet and the year end</p>
        </div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="filter-select" value={fy} onChange={(e) => setFy(e.target.value)} aria-label="Financial year">
            {fyOptions.map((f) => <option key={f.value} value={f.value}>{f.label}{closed[f.label.replace(/^FY /, '')] ? ' (closed)' : ''}</option>)}
          </select>
          <button type="button" className="btn btn-primary" onClick={downloadPack} disabled={!data}><FileSpreadsheet size={16} /> CA pack (Excel)</button>
        </div>
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
                <h3>Trial balance <span style={muted}>· as on {period.to}</span>
                  {Math.abs(tb.difference) >= 0.005 && <span style={{ ...muted, color: 'var(--danger)', display: 'block' }}>Does not agree: off by {money(tb.difference)}</span>}</h3>
                <TableExport title="Trial balance" subtitle={subtitle} filename={`Trial-balance-${fileTag}`} headers={['Group', 'Account', 'Debit', 'Credit']}
                  rows={[...tb.rows.map((r) => [ACCOUNT_GROUPS[r.group]?.name || r.group, r.name, r.net > 0 ? r.net : '', r.net < 0 ? -r.net : '']), ['', 'Total', tb.dr, tb.cr]]} />
              </div>
              <div className="table-scroll">
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
              </div>
              <p style={{ ...muted, padding: '0.75rem 1rem' }}>Closing stock on {period.to}: {money(tb.closingStock)} (at average purchase cost, without GST). Income and expense accounts show this year only; earlier years' profit is in one line. Click an account to open its ledger.</p>
            </div>
          )}

          {tab === 'pl' && (
            <div className="glass-panel">
              <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3>Trading and profit &amp; loss account <span style={muted}>· {period.from} to {period.to}</span></h3>
                <TableExport title="Profit and loss account" subtitle={subtitle} filename={`Profit-and-loss-${fileTag}`} headers={['Particulars', 'Amount', 'Total']}
                  rows={caPackSheets(data, { ...range, profile }).find((s) => s.name === 'Profit and loss').rows.slice(1)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', padding: '1rem' }}>
                <Side title="Debit" rows={[
                  ['Opening stock', pl.openingStock, null],
                  ...pl.purchases.map((r) => [r.name, r.net, r.id]), ...pl.directExpenses.map((r) => [r.name, r.net, r.id]),
                  ...(pl.grossProfit >= 0 ? [['Gross profit c/o', pl.grossProfit, null, true]] : []),
                ]} nameCell={nameCell} />
                <Side title="Credit" rows={[
                  ...pl.sales.map((r) => [r.name, -r.net, r.id]), ...pl.directIncomes.map((r) => [r.name, -r.net, r.id]),
                  ['Closing stock', pl.closingStock, null],
                  ...(pl.grossProfit < 0 ? [['Gross loss c/o', -pl.grossProfit, null, true]] : []),
                ]} nameCell={nameCell} />
                <Side title="Expenses" rows={[
                  ...(pl.grossProfit < 0 ? [['Gross loss b/f', -pl.grossProfit, null]] : []),
                  ...pl.indirectExpenses.map((r) => [r.name, r.net, r.id]),
                  ...(pl.netProfit >= 0 ? [['Net profit', pl.netProfit, null, true]] : []),
                ]} nameCell={nameCell} />
                <Side title="Incomes" rows={[
                  ...(pl.grossProfit >= 0 ? [['Gross profit b/f', pl.grossProfit, null]] : []),
                  ...pl.indirectIncomes.map((r) => [r.name, -r.net, r.id]),
                  ...(pl.netProfit < 0 ? [['Net loss', -pl.netProfit, null, true]] : []),
                ]} nameCell={nameCell} />
              </div>
              <p style={{ ...muted, padding: '0 1rem 1rem' }}>
                {pl.netProfit >= 0 ? 'Net profit' : 'Net loss'} for {period.label}: <strong>{money(Math.abs(pl.netProfit))}</strong>. Sales and purchases are without GST; GST is in the duties and taxes accounts.
              </p>
            </div>
          )}

          {tab === 'bs' && (
            <div className="glass-panel">
              <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3>Balance sheet <span style={muted}>· as on {period.to}</span>
                  {Math.abs(bs.difference) >= 0.005 && <span style={{ ...muted, color: 'var(--danger)', display: 'block' }}>Does not agree: off by {money(bs.difference)}</span>}</h3>
                <TableExport title="Balance sheet" subtitle={subtitle} filename={`Balance-sheet-${fileTag}`} headers={['Particulars', 'Amount', 'Total']}
                  rows={caPackSheets(data, { ...range, profile }).find((s) => s.name === 'Balance sheet').rows.slice(1)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', padding: '1rem' }}>
                <Groups title="Liabilities" groups={bs.liabilities} total={bs.totalLiabilities} nameCell={nameCell} />
                <Groups title="Assets" groups={bs.assets} total={bs.totalAssets} nameCell={nameCell} />
              </div>
            </div>
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

function Side({ title, rows, nameCell }) {
  const total = rows.reduce((s, r) => s + (Number(r[1]) || 0), 0);
  return (
    <div>
      <table className="data-table" style={{ minWidth: 0 }}>
        <thead><tr><th>{title}</th><th style={right}>Amount</th></tr></thead>
        <tbody>
          {rows.map(([name, amount, id, bold], i) => (
            <tr key={`${name}-${i}`} style={bold ? { fontWeight: 700 } : undefined}><td>{nameCell(id, name)}</td><td style={right}>{money(amount)}</td></tr>
          ))}
          <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}><td>Total</td><td style={right}>{money(total)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function Groups({ title, groups, total, nameCell }) {
  return (
    <div>
      <table className="data-table" style={{ minWidth: 0 }}>
        <thead><tr><th>{title}</th><th style={right}>Amount</th><th style={right}>Total</th></tr></thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows key={g.group + g.name} g={g} nameCell={nameCell} />
          ))}
          <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}><td>Total</td><td /><td style={right}>{money(total)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
function GroupRows({ g, nameCell }) {
  return (
    <>
      <tr style={{ fontWeight: 600 }}><td>{g.name}</td><td /><td style={right}>{money(g.total)}</td></tr>
      {g.items.map((i) => <tr key={i.id + i.name}><td style={{ paddingLeft: '1.5rem' }}>{nameCell(i.id, i.name)}</td><td style={right}>{money(i.amount)}</td><td /></tr>)}
    </>
  );
}
