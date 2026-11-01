// Divtech Hisaab - GSTR-3B → Record GST paid: the accounting entry for the
// period's GST, as one payment voucher. Credit of one head used against
// another moves between the GST accounts; the tax paid in cash (with interest
// and late fee) comes out of the bank, cash or CC account picked. After this
// the GST accounts show only the credit carried forward. Rules: utils/gstPayment.js.
import { useEffect, useMemo, useState } from 'react';
import { X, Save } from 'lucide-react';
import { getAllVouchers, saveVoucher } from '../store';
import { formatCurrency, localToday, getFinancialYearLabel, parseLocalDate, belongsToProfile } from '../utils';
import { gstSetOffMoves, gstPaymentLines } from '../utils/gstPayment';
import { nextVoucherNumber } from '../utils/vouchers';
import { useMoneyAccounts } from './MoneyAccountSelect';
import { confirmClosedYear } from './useClosedYears';
import HelpButton from './HelpButton';
import { toast } from './Toast';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const HEAD_NAME = { igst: 'IGST', cgst: 'CGST', sgst: 'SGST / UTGST', cess: 'Cess' };

export default function GstPaidModal({ periodLabel, returnPeriod, liability, credit, cessDue = 0, profile, onClose, onOpenVouchers }) {
  const { moves, payable } = useMemo(() => gstSetOffMoves(liability, credit), [liability, credit]);
  const [vouchers, setVouchers] = useState(null);
  const money = useMoneyAccounts();
  const [form, setForm] = useState(() => ({
    date: localToday(), from: 'bank', challan: '',
    igst: String(r2(payable.igst) || ''), cgst: String(r2(payable.cgst) || ''), sgst: String(r2(payable.sgst) || ''), cess: String(r2(cessDue) || ''),
    interest: '', lateFee: '',
  }));
  const [busy, setBusy] = useState(false);
  const tag = `gst:${returnPeriod}`;
  useEffect(() => {
    getAllVouchers().then((l) => setVouchers((l || []).filter((v) => belongsToProfile(v, profile)))).catch(() => setVouchers([]));
  }, [profile]);
  const existing = (vouchers || []).find((v) => v.tag === tag);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const cash = { igst: form.igst, cgst: form.cgst, sgst: form.sgst, cess: form.cess };
  const lines = gstPaymentLines({ moves, cash, interest: form.interest, lateFee: form.lateFee, from: form.from });
  const total = r2(['igst', 'cgst', 'sgst', 'cess', 'interest', 'lateFee'].reduce((s, k) => s + (Number(form[k]) || 0), 0));
  const crossMoves = moves.filter((m) => m.from !== m.to);

  const save = async (e) => {
    e.preventDefault();
    if (!lines.length) { toast('Nothing to record: no tax to pay and no credit moved between heads.', 'info'); return; }
    if (!(await confirmClosedYear(form.date, profile))) return;
    setBusy(true);
    try {
      const v = await saveVoucher({
        type: total > 0 ? 'payment' : 'journal', date: form.date, tag,
        number: nextVoucherNumber(vouchers || [], total > 0 ? 'payment' : 'journal', getFinancialYearLabel(parseLocalDate(form.date))),
        narration: `GST for ${periodLabel} (GSTR-3B)${form.challan.trim() ? `, challan ${form.challan.trim()}` : ''}`,
        lines, ownerGstin: profile?.gstin || '', ownerName: profile?.businessName || '',
      });
      toast(`${v.number} saved: GST for ${periodLabel}${total > 0 ? `, ${formatCurrency(total)} paid` : ''}`, 'success');
      onClose();
    } catch (err) { toast(err.message || 'Could not save', 'error'); } finally { setBusy(false); }
  };
  const label = { display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 };
  const muted = { color: 'var(--text-muted)', fontSize: '0.8rem' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-content" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="section-title" style={{ margin: 0 }}>Record GST paid: {periodLabel} <HelpButton title="Record GST paid" doc="gst-returns#gst-paid" size={15} /></h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {existing && (
          <div className="notice notice-info" style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.82rem' }}>
            Already recorded for this period: <strong>{existing.number}</strong> on {existing.date}. Saving again adds a second entry; to change it, edit it on <a href="#" onClick={(ev) => { ev.preventDefault(); onClose(); onOpenVouchers?.(); }}>Vouchers</a>.
          </div>
        )}
        <p style={{ ...muted, marginTop: 0 }}>
          The amounts are what GSTR-3B says to pay in cash after using your input tax credit. Change them to what you actually paid (the challan).
          {crossMoves.length > 0 && <> Credit used across heads: {crossMoves.map((m) => `${HEAD_NAME[m.from]} ${formatCurrency(m.amount)} for ${HEAD_NAME[m.to]}`).join(', ')}.</>}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
          {['igst', 'cgst', 'sgst', 'cess'].map((h) => (
            <div key={h}>
              <label style={label} htmlFor={`gstpay-${h}`}>{HEAD_NAME[h]} paid</label>
              <input id={`gstpay-${h}`} type="number" min="0" step="0.01" className="form-input" value={form[h]} onChange={set(h)} placeholder="0" />
            </div>
          ))}
          <div>
            <label style={label} htmlFor="gstpay-int">Interest</label>
            <input id="gstpay-int" type="number" min="0" step="0.01" className="form-input" value={form.interest} onChange={set('interest')} placeholder="0" />
          </div>
          <div>
            <label style={label} htmlFor="gstpay-fee">Late fee</label>
            <input id="gstpay-fee" type="number" min="0" step="0.01" className="form-input" value={form.lateFee} onChange={set('lateFee')} placeholder="0" />
          </div>
          <div>
            <label style={label} htmlFor="gstpay-date">Paid on</label>
            <input id="gstpay-date" type="date" className="form-input" value={form.date} onChange={set('date')} />
          </div>
          <div>
            <label style={label} htmlFor="gstpay-from">Paid from</label>
            <select id="gstpay-from" className="form-input" value={form.from} onChange={set('from')}>
              <option value="bank">Bank (Bank book)</option>
              <option value="cash">Cash</option>
              {money.map((a) => <option key={a.id} value={`acc:${a.id}`}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="gstpay-challan">Challan (CPIN / CIN)</label>
            <input id="gstpay-challan" className="form-input" value={form.challan} onChange={set('challan')} placeholder="Optional" />
          </div>
        </div>
        <p style={{ fontWeight: 600, margin: '0.75rem 0 0' }}>Total paid: {formatCurrency(total)}</p>
        <div className="flex gap-2" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || vouchers === null}><Save size={16} /> Save entry</button>
        </div>
      </form>
    </div>
  );
}
