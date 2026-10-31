// Divtech Hisaab - Ledgers: any ledger on one screen. A customer, a supplier,
// an item (stock in and out, without GST), each GST head, cash, bank, sales,
// purchases and expenses. Every line comes from the invoices, receipts,
// purchases, expenses and cash / bank book entries already saved
// (utils/ledgers.js), so nothing is posted twice and nothing can drift.
import { useState, useEffect, useMemo } from 'react';
import { BookText, Search, X } from 'lucide-react';
import useBooks from './useBooks';
import { formatCurrency, parseLocalDate } from '../utils';
import { periodRange } from '../utils/cashBook';
import { ledgerCatalog, buildLedger, ledgerView, side } from '../utils/ledgers';
import { LEDGER_PRESET_KEY } from '../utils/openLedger';
import { toast } from './Toast';
import HelpButton from './HelpButton';
import TableExport from './TableExport';

const PERIODS = [['fy', 'This financial year'], ['month', 'This month'], ['lastMonth', 'Last month'], ['all', 'All dates'], ['custom', 'Choose dates']];
const showDate = (d) => (d ? parseLocalDate(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const num = (v) => (Math.abs(v) < 0.005 ? '' : formatCurrency(v));
const drCr = (v) => (Math.abs(v) < 0.005 ? formatCurrency(0) : `${formatCurrency(Math.abs(v))} ${side(v)}`);
const qtyText = (q, unit) => (q ? `${Number(q.toFixed(3))}${unit ? ` ${unit}` : ''}` : '');
const right = { textAlign: 'right', whiteSpace: 'nowrap' };
const muted = { color: 'var(--text-muted)', fontSize: '0.8rem' };

const readPreset = () => {
  try {
    const id = sessionStorage.getItem(LEDGER_PRESET_KEY);
    if (id) sessionStorage.removeItem(LEDGER_PRESET_KEY);
    return id || '';
  } catch { return ''; }
};

export default function LedgersView() {
  const { data, profile, error } = useBooks();
  const [selected, setSelected] = useState(readPreset);
  const [filter, setFilter] = useState('');
  const [period, setPeriod] = useState('fy');
  const [custom, setCustom] = useState(() => periodRange('fy'));

  useEffect(() => { if (error) toast('Could not load the ledgers', 'error'); }, [error]);

  const catalog = useMemo(() => (data ? ledgerCatalog(data) : []), [data]);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return catalog.map((g) => ({ ...g, items: q ? g.items.filter((i) => i.name.toLowerCase().includes(q) || g.group.toLowerCase().includes(q)) : g.items }))
      .filter((g) => g.items.length);
  }, [catalog, filter]);
  const current = selected || catalog[0]?.items[0]?.id || '';
  const ledger = useMemo(() => (data && current ? buildLedger(current, data) : null), [data, current]);
  const range = period === 'custom' ? custom : periodRange(period);
  const periodLabel = period === 'custom'
    ? [range.from && `from ${showDate(range.from)}`, range.to && `to ${showDate(range.to)}`].filter(Boolean).join(' ') || 'All dates'
    : PERIODS.find(([k]) => k === period)[1];

  // Money ledgers: Dr / Cr with a running balance.
  const view = useMemo(() => (ledger?.kind === 'money' ? ledgerView(ledger.entries, range) : null), [ledger, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  // Item ledgers: movements in the period, with the stock carried in.
  const item = useMemo(() => {
    if (ledger?.kind !== 'item') return null;
    const inRange = (d) => (!range.from || d >= range.from) && (!range.to || d <= range.to);
    const before = ledger.rows.filter((r) => r.kind !== 'opening' && range.from && r.date < range.from);
    const carried = before.length ? before[before.length - 1] : ledger.rows[0];
    const rows = ledger.rows.filter((r) => r.kind !== 'opening' && inRange(r.date || ''));
    const tot = rows.reduce((t, r) => ({
      qtyIn: t.qtyIn + r.qtyIn, qtyOut: t.qtyOut + r.qtyOut,
      bought: t.bought + (r.kind === 'purchase' ? r.value : 0),
      sold: t.sold + (r.kind === 'sale' ? r.value : r.kind === 'return' ? -r.value : 0),
      cost: t.cost + (r.kind === 'challan' ? 0 : r.cost || 0),
    }), { qtyIn: 0, qtyOut: 0, bought: 0, sold: 0, cost: 0 });
    const last = rows.length ? rows[rows.length - 1] : carried;
    const afterTo = range.to && ledger.rows.some((r) => r.kind !== 'opening' && r.date > range.to);
    return { opening: carried, rows, tot, closing: afterTo ? last : { balanceQty: ledger.closingQty, avgCost: ledger.avgCost, balanceValue: ledger.closingValue } };
  }, [ledger, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = ledger ? `${ledger.title} ledger` : 'Ledger';
  const subtitle = [profile?.businessName, periodLabel].filter(Boolean).join(', ');
  const exportHeaders = ledger?.kind === 'item'
    ? ['Date', 'Particulars', 'Ref', 'In', 'Out', 'Rate', 'Value (no GST)', 'Stock', 'Avg cost', 'Stock value']
    : ['Date', 'Particulars', 'Ref', 'Debit', 'Credit', 'Balance'];
  const exportRows = ledger?.kind === 'item' && item
    ? [
        ['', 'Opening stock', '', '', '', '', '', qtyText(item.opening.balanceQty, ledger.unit), item.opening.avgCost, item.opening.balanceValue],
        ...item.rows.map((r) => [showDate(r.date), r.particulars, r.ref || '', r.qtyIn || '', r.qtyOut || '', r.rate, r.value, qtyText(r.balanceQty, ledger.unit), r.avgCost, r.balanceValue]),
      ]
    : view
      ? [
          ['', 'Opening balance', '', '', '', drCr(view.opening)],
          ...view.rows.map((r) => [showDate(r.date), r.particulars, r.ref || '', r.dr || '', r.cr || '', drCr(r.balance)]),
          ['', 'Total', '', view.totals.dr, view.totals.cr, drCr(view.closing)],
        ]
      : [];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Ledgers <HelpButton title="Ledgers" doc="ledgers" size={16} /></h1>
          <p className="page-subtitle">Any ledger: a customer, a supplier, an item, GST, cash, bank, sales or purchases</p>
        </div>
      </div>

      <div className="glass-panel p-4 mb-6">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-box" style={{ maxWidth: '240px' }}>
            <Search size={16} className="search-icon" />
            <input type="text" className="search-input" placeholder="Find a ledger..." value={filter}
              onChange={(e) => {
                const q = e.target.value;
                setFilter(q);
                const t = q.trim().toLowerCase();
                const first = t && catalog.flatMap((g) => g.items).find((i) => i.name.toLowerCase().includes(t));
                if (first) setSelected(first.id);
              }} aria-label="Find a ledger" />
          </div>
          <select className="filter-select" value={current} onChange={(e) => setSelected(e.target.value)} aria-label="Ledger" style={{ minWidth: 240 }}>
            {shown.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </optgroup>
            ))}
            {current && !shown.some((g) => g.items.some((i) => i.id === current)) && ledger && <option value={current}>{ledger.title}</option>}
          </select>
          <select className="filter-select" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Dates">
            {PERIODS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          {period === 'custom' && (
            <>
              <input type="date" className="form-input" style={{ width: 'auto' }} value={custom.from} aria-label="From"
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
              <input type="date" className="form-input" style={{ width: 'auto' }} value={custom.to} aria-label="To"
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </>
          )}
          {(filter || period !== 'fy') && (
            <button className="icon-btn icon-btn-red" onClick={() => { setFilter(''); setPeriod('fy'); }} title="Clear filters" aria-label="Clear filters"><X size={15} /></button>
          )}
        </div>
      </div>

      <div className="glass-panel">
        <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3>{title} <span style={muted}>· {periodLabel}</span>
            {ledger?.account?.group === 'cc' && view && (() => {
              const used = Math.max(0, -view.closing);
              const limit = Number(ledger.account.limit) || 0;
              return <span style={{ ...muted, display: 'block', fontWeight: 400 }}>Limit {formatCurrency(limit)} · used {formatCurrency(used)} · available {formatCurrency(Math.max(0, limit - used))}</span>;
            })()}
          </h3>
          {ledger && <TableExport title={title} subtitle={subtitle} filename={`${title.replace(/[^\w]+/g, '-')}-${periodLabel.replace(/[^\w]+/g, '-')}`} headers={exportHeaders} rows={exportRows} landscape={ledger.kind === 'item'} />}
        </div>

        {!data ? (
          <div className="empty-state"><p>Loading...</p></div>
        ) : !ledger ? (
          <div className="empty-state"><BookText size={48} /><p>Pick a ledger above.</p></div>
        ) : ledger.kind === 'item' ? (
          <div className="table-scroll">
            <table className="data-table" style={{ minWidth: '900px' }}>
              <thead>
                <tr>
                  <th>Date</th><th>Particulars</th>
                  <th style={right}>In</th><th style={right}>Out</th><th style={right}>Rate</th><th style={right}>Value (no GST)</th>
                  <th style={right}>Stock</th><th style={right}>Avg cost</th><th style={right}>Stock value</th>
                </tr>
              </thead>
              <tbody>
                <tr style={muted}>
                  <td>{range.from ? showDate(range.from) : ''}</td>
                  <td style={{ fontStyle: 'italic' }}>Opening stock</td>
                  <td colSpan={4} />
                  <td style={right}>{qtyText(item.opening.balanceQty, ledger.unit) || '0'}</td>
                  <td style={right}>{num(item.opening.avgCost)}</td>
                  <td style={right}>{formatCurrency(item.opening.balanceValue)}</td>
                </tr>
                {item.rows.map((r) => (
                  <tr key={r.key}>
                    <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{showDate(r.date)}</td>
                    <td style={{ whiteSpace: 'normal', maxWidth: 320 }}>
                      <div className="font-medium">{r.particulars}</div>
                      {r.ref && <div style={muted}>{r.ref}</div>}
                      {r.unlinked && <div style={{ ...muted, color: 'var(--warn-text, #b45309)' }} title="Pick the item from the product list on the invoice so Products' stock follows it">Typed on the invoice, not picked from Products: stock there did not change</div>}
                    </td>
                    <td style={{ ...right, color: 'var(--success)' }}>{qtyText(r.qtyIn)}</td>
                    <td style={{ ...right, color: 'var(--danger)' }}>{qtyText(r.qtyOut)}</td>
                    <td style={right}>{num(r.rate)}</td>
                    <td style={right}>{num(r.value)}</td>
                    <td style={{ ...right, color: r.balanceQty < 0 ? 'var(--danger)' : undefined }}>{qtyText(r.balanceQty, ledger.unit) || '0'}</td>
                    <td style={right}>{num(r.avgCost)}</td>
                    <td style={right}>{formatCurrency(r.balanceValue)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 600 }}>
                  <td />
                  <td>Closing stock</td>
                  <td style={right}>{qtyText(item.tot.qtyIn)}</td>
                  <td style={right}>{qtyText(item.tot.qtyOut)}</td>
                  <td />
                  <td />
                  <td style={right}>{qtyText(item.closing.balanceQty, ledger.unit) || '0'}</td>
                  <td style={right}>{num(item.closing.avgCost)}</td>
                  <td style={right}>{formatCurrency(item.closing.balanceValue)}</td>
                </tr>
              </tbody>
            </table>
            <p style={{ ...muted, padding: '0.75rem 1rem' }}>
              In these dates: bought {formatCurrency(item.tot.bought)}, sold {formatCurrency(item.tot.sold)} (without GST),
              cost of what was sold {formatCurrency(item.tot.cost)}, margin {formatCurrency(item.tot.sold - item.tot.cost)}
              {item.tot.sold > 0 ? ` (${(((item.tot.sold - item.tot.cost) / item.tot.sold) * 100).toFixed(1)}%)` : ''}.
              Cost is the weighted average purchase rate. GST is in the GST ledgers.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table" style={{ minWidth: '720px' }}>
              <thead>
                <tr>
                  <th>Date</th><th>Particulars</th>
                  <th style={right}>Debit</th><th style={right}>Credit</th><th style={right}>Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr style={muted}>
                  <td>{range.from ? showDate(range.from) : ''}</td>
                  <td style={{ fontStyle: 'italic' }}>Opening balance{range.from ? ' (brought forward)' : ''}</td>
                  <td /><td />
                  <td style={{ ...right, fontWeight: 600 }}>{drCr(view.opening)}</td>
                </tr>
                {view.rows.map((r) => (
                  <tr key={r.key}>
                    <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{showDate(r.date)}</td>
                    <td style={{ whiteSpace: 'normal', maxWidth: 360 }}>
                      <div className="font-medium">{r.particulars}</div>
                      {(r.ref || r.note) && <div style={muted}>{[r.ref, r.note].filter(Boolean).join(' · ')}</div>}
                    </td>
                    <td style={right}>{num(r.dr)}</td>
                    <td style={right}>{num(r.cr)}</td>
                    <td style={right}>{drCr(r.balance)}</td>
                  </tr>
                ))}
                {view.rows.length === 0 && (
                  <tr><td colSpan={5} style={{ ...muted, textAlign: 'center', padding: '1.5rem' }}>Nothing in these dates.</td></tr>
                )}
                <tr style={{ fontWeight: 600 }}>
                  <td />
                  <td>Total · closing balance</td>
                  <td style={right}>{formatCurrency(view.totals.dr)}</td>
                  <td style={right}>{formatCurrency(view.totals.cr)}</td>
                  <td style={right}>{drCr(view.closing)}</td>
                </tr>
              </tbody>
            </table>
            <p style={{ ...muted, padding: '0.75rem 1rem' }}>
              Dr: the customer owes you / money you have / GST you can claim. Cr: you owe the supplier / GST you collected / sales.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
