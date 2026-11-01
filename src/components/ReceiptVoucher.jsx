import { useState, useEffect, useRef } from 'react';
import { Receipt, Plus, Trash2, Search, Printer, Pencil } from 'lucide-react';
import { getAllReceipts, saveReceipt, deleteReceipt, getAllBills, getProfile, getNextInvoiceNumber, saveBill, getAllOpeningBalances, saveOpeningBalance } from '../store';
import { OPENING_REF, openingDue, openingFor } from '../utils/openingBalances';
import { OPENING_EVENT } from './OpeningBalances';
import { formatCurrency, numberToWords, belongsToProfile, isUnassignedToBusiness, countsAsSales, businessKeyOf, localToday, amountDue, paymentStatusFor, isCancelledBill } from '../utils';
import UnassignedBanner from './UnassignedBanner';
import { toast } from './Toast';
import { confirmClosedYear } from './useClosedYears';
import MoneyAccountSelect, { showsBankChoice } from './MoneyAccountSelect';
import { confirmAction } from './ConfirmModal';
import HelpButton from './HelpButton';

const PAYMENT_MODES = ['Bank Transfer', 'UPI', 'Cash', 'Cheque', 'Card', 'Other'];

// date is filled in when the form opens (localToday): set here it was the
// day the app was loaded, in UTC.
const emptyForm = {
  date: '',
  receiptNo: '',
  clientName: '',
  clientAddress: '',
  amount: '',
  paymentMode: 'Bank Transfer',
  account: '', // Divtech Hisaab - another bank or CC account ('' = Bank)
  discount: '', // Divtech Hisaab - kasar / discount allowed, settled with this receipt
  referenceNo: '',
  againstInvoice: '',
  note: '',
};

export default function ReceiptVoucher() {
  const [receipts, setReceipts] = useState([]);
  const [bills, setBills] = useState([]);
  // Divtech Hisaab - client opening balances, which a receipt can pay off.
  const [openings, setOpenings] = useState([]);
  const [profile, setProfile] = useState({});
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [previewReceipt, setPreviewReceipt] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const receiptRef = useRef(null);
  // v1.10.74 - the number previewed when the form opened, so save can tell
  // whether the user typed their own.
  const previewedNoRef = useRef('');

  const loadData = async () => {
    try {
      const [recs, bls, prof, obs] = await Promise.all([getAllReceipts(), getAllBills(), getProfile(), getAllOpeningBalances().catch(() => [])]);
      setOpenings((obs || []).filter(o => o.party === 'client' && belongsToProfile(o, prof)));
      // v1.10.66 (#64 item 2) — receipts belong to one business, like its
      // invoices. Both lists are narrowed: the receipts shown, and the
      // invoices offered in Quick Select and matched by "Against Invoice".
      // Two businesses can each have an INV/2026-27/0001, so matching across
      // them could post a payment against the other company's invoice.
      // Receipts saved before this carry no business and are always shown.
      setReceipts((recs || []).filter(r => belongsToProfile(r, prof)));
      setBills((bls || []).filter(b => belongsToProfile(b, prof)));
      setProfile(prof || {});
    } catch {
      toast('Failed to load data', 'error');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Peek at the next receipt number using the SAME atomic counter that
  // invoice numbers use. Pre-v1.6.8 this counted `receipts.length + 1`
  // which raced under concurrent saves + two tabs.
  const getNextReceiptNo = async () => {
    try {
      // v1.10.79 (#95) - a business with its own numbering numbers its receipts too.
      return await getNextInvoiceNumber('RCP', { peek: true, businessKey: businessKeyOf(profile) });
    } catch {
      // Fallback preserves old behaviour if server is offline mid-mount
      const count = receipts.length + 1;
      const now = new Date();
      const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      return `RCP/${fy}-${String(fy + 1).slice(-2)}/${String(count).padStart(4, '0')}`;
    }
  };

  const filtered = search.trim()
    ? receipts.filter(r =>
        (r.clientName || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.receiptNo || '').toLowerCase().includes(search.toLowerCase()))
    : receipts;

  const openAdd = async () => {
    const receiptNo = await getNextReceiptNo();
    previewedNoRef.current = receiptNo;
    setForm({ ...emptyForm, date: localToday(), receiptNo });
    setEditingId(null);
    setShowForm(true);
  };

  // v1.10.16 — reported: "here also add edit option" — the Payment Receipts
  // list only had Print + Delete. Delete + re-create lost the original
  // receipt number and the paid-against linkage. Now Edit opens the same
  // form pre-filled with the receipt fields; save re-POSTs with the same
  // id so the server upserts in place.
  const openEdit = (rcp) => {
    setForm({
      date: rcp.date || localToday(),
      receiptNo: rcp.receiptNo || '',
      clientName: rcp.clientName || '',
      clientAddress: rcp.clientAddress || '',
      amount: String(rcp.amount ?? ''),
      paymentMode: rcp.paymentMode || 'Bank Transfer',
      account: rcp.account || '',
      discount: rcp.discount ? String(rcp.discount) : '',
      referenceNo: rcp.referenceNo || '',
      againstInvoice: rcp.againstInvoice || '',
      note: rcp.note || '',
    });
    setEditingId(rcp.id);
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setForm({ ...emptyForm }); setEditingId(null); };

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const selectInvoice = (bill) => {
    setForm(prev => ({
      ...prev,
      clientName: bill.clientName || '',
      clientAddress: bill.data?.client?.address || '',
      // v1.10.23 — clamp negative (overpaid) to 0 so the new-receipt
      // amount input doesn't start pre-filled with a negative number.
      amount: String(Math.max(0, Math.round((amountDue(bill) - (bill.paidAmount || 0)) * 100) / 100)),
      againstInvoice: bill.invoiceNumber || '',
    }));
  };

  // Divtech Hisaab - "Against Invoice" says Opening balance.
  const isOpeningRef = (ref) => String(ref || '').trim().toLowerCase() === OPENING_REF.toLowerCase();
  const selectOpening = (ob) => {
    setForm(prev => ({ ...prev, clientName: ob.name, amount: String(openingDue(ob)), againstInvoice: OPENING_REF }));
  };
  // Put this receipt's payment on (entry) or take it off (null) the client's
  // opening balance. Fresh copy from the server, so two edits never collide.
  const syncOpeningPayment = async (clientName, receiptNo, entry) => {
    const latest = await getAllOpeningBalances();
    const ob = openingFor((latest || []).filter(o => o.party === 'client' && belongsToProfile(o, profile)), 'client', clientName);
    if (!ob) return entry ? 'missing' : 'ok';
    const kept = (ob.payments || []).filter(p => p.receiptNo !== receiptNo);
    const payments = entry ? [...kept, ...(Array.isArray(entry) ? entry : [entry])] : kept;
    if (!entry && kept.length === (ob.payments || []).length) return 'ok';
    const paid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    if (entry && paid > Number(ob.amount) + 0.005) return 'too-much';
    await saveOpeningBalance({ ...ob, payments });
    window.dispatchEvent(new Event(OPENING_EVENT));
    return 'ok';
  };

  const handleSave = async () => {
    if (!form.clientName.trim()) { toast('Client name required', 'warning'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast('Enter valid amount', 'warning'); return; }
    if (!(await confirmClosedYear(form.date, profile))) return;
    try {
      // v1.10.16 — Edit mode preserves the original receipt number and id so
      // the server upserts in place. Only new receipts reserve a fresh
      // atomic number from the RCP counter.
      let receiptNo = form.receiptNo;
      // v1.10.74 - a number the user typed is kept; only the auto number
      // (or an empty field) is swapped for a freshly reserved one.
      if (!editingId && (!receiptNo.trim() || receiptNo.trim() === previewedNoRef.current)) {
        try {
          receiptNo = await getNextInvoiceNumber('RCP', { businessKey: businessKeyOf(profile) });
        } catch { receiptNo = receiptNo.trim() || previewedNoRef.current; /* fall back to peeked number */ }
      }

      // v1.10.66 (#64 item 2) — a NEW receipt is stamped with the business
      // selected now. An edited receipt keeps what it had, including no business
      // at all: an older receipt is assigned only through the explicit "Assign
      // to" banner, never as a side effect of fixing a typo while some other
      // business happens to be selected.
      const existing = editingId ? receipts.find(r => r.id === editingId) : null;
      const modeKeyOf = { 'Bank Transfer': 'bank-transfer', 'UPI': 'upi', 'Cash': 'cash', 'Cheque': 'cheque', 'Card': 'card', 'Other': 'other' };
      const discount = Math.round((parseFloat(form.discount) || 0) * 100) / 100;
      const receipt = {
        ...form,
        receiptNo,
        amount: parseFloat(form.amount),
        discount,
        account: showsBankChoice(modeKeyOf[form.paymentMode]) ? form.account : '',
        ownerGstin: existing ? (existing.ownerGstin || '') : (profile?.gstin || ''),
        ownerName: existing ? (existing.ownerName || '') : (profile?.businessName || ''),
      };
      if (editingId) receipt.id = editingId;
      await saveReceipt(receipt);

      // P1 #19: propagate the payment to the linked invoice so the Dashboard
      // shows the invoice as paid/partial and doesn't require the user to
      // double-record via the payment modal. If no invoice link, skip
      // silently — receipts against ad-hoc payments (advances, deposits)
      // aren't tied to any bill.
      // v1.10.16 — Edit mode: find the previously-propagated payment record
      // in the linked bill (matched by receiptNo) and update it in place
      // instead of appending. Prevents double-counting when a receipt is
      // edited. If the linked invoice was changed, we remove the old
      // propagation and add a fresh one to the new invoice.
      const modeMap = { 'Bank Transfer': 'bank-transfer', 'UPI': 'upi', 'Cash': 'cash', 'Cheque': 'cheque', 'Card': 'card', 'Other': 'other' };
      const paidAmount = parseFloat(form.amount);
      // A cancelled invoice stays cancelled (un-cancel it on the Dashboard,
      // which also fixes its stock); otherwise paid once the payments cover
      // the total less TDS.
      const statusFor = (bill, paid) => (isCancelledBill(bill) ? 'cancelled' : paymentStatusFor(bill, paid));
      const stripReceiptFromBill = async (bill) => {
        if (!bill) return;
        const priorPayments = bill.payments || [];
        const kept = priorPayments.filter(p => p.receiptNo !== receiptNo && !(editingId && p.discountFor === editingId));
        if (kept.length === priorPayments.length) return;
        const newTotal = kept.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        await saveBill({ ...bill, paidAmount: newTotal, status: statusFor(bill, newTotal), payments: kept }, { overwrite: true });
      };
      // If editing and the linked invoice changed (or was removed), scrub
      // the old link first.
      if (editingId) {
        try {
          const original = receipts.find(r => r.id === editingId);
          const oldRef = original?.againstInvoice?.trim();
          const newRef = form.againstInvoice?.trim();
          if (oldRef && oldRef !== newRef) {
            if (isOpeningRef(oldRef)) await syncOpeningPayment(original.clientName, receiptNo, null);
            else {
              const oldBill = bills.find(b => b.invoiceNumber === oldRef || b.id === oldRef);
              await stripReceiptFromBill(oldBill);
            }
          } else if (oldRef && isOpeningRef(oldRef) && original.clientName.trim().toLowerCase() !== form.clientName.trim().toLowerCase()) {
            await syncOpeningPayment(original.clientName, receiptNo, null);
          }
        } catch { /* non-fatal */ }
      }
      let unmatchedRef = '';
      if (isOpeningRef(form.againstInvoice)) {
        const res = await syncOpeningPayment(form.clientName, receiptNo, [{
          id: receipt.id, amount: paidAmount, date: form.date, mode: modeMap[form.paymentMode] || 'other', account: receipt.account,
          note: `Receipt ${receiptNo}${form.referenceNo ? ' · ref ' + form.referenceNo : ''}`, receiptNo, receiptId: receipt.id,
        }, ...(discount > 0 ? [{ id: `${receipt.id}:disc`, amount: discount, date: form.date, mode: 'discount', note: `Discount / kasar on receipt ${receiptNo}`, receiptNo, receiptId: receipt.id }] : [])]).catch(() => 'failed');
        if (res === 'missing') toast(`${form.clientName} has no opening balance, so this receipt is saved on its own.`, 'info', 7000);
        else if (res === 'too-much') toast('This is more than the opening balance still open, so it was not counted against it. Check the amount.', 'warning', 8000);
        else if (res === 'failed') toast('The receipt is saved, but the opening balance could not be updated.', 'warning', 8000);
      } else if (form.againstInvoice && form.againstInvoice.trim()) {
        try {
          const bill = bills.find(b => b.invoiceNumber === form.againstInvoice.trim() || b.id === form.againstInvoice.trim());
          if (!bill) unmatchedRef = form.againstInvoice.trim(); // v1.10.74 - tell the user below
          if (bill) {
            // Divtech Hisaab - the receipt's discount (kasar) settles the
            // rest of the invoice: its own payment line, mode 'discount'.
            const priorPayments = (bill.payments || []).filter(p => p.discountFor !== receipt.id);
            const priorIdx = priorPayments.findIndex(p => p.receiptNo === receiptNo);
            const nextEntry = {
              // The receipt's id, as payments recorded on the Dashboard carry
              // theirs: editing or deleting the payment there then updates this
              // receipt instead of making a second one.
              id: receipt.id,
              amount: paidAmount,
              date: form.date,
              mode: modeMap[form.paymentMode] || 'other',
              ...(receipt.account ? { account: receipt.account } : {}),
              note: `Receipt ${receiptNo}${form.referenceNo ? ' · ref ' + form.referenceNo : ''}`,
              recordedAt: priorIdx >= 0 ? priorPayments[priorIdx].recordedAt : new Date().toISOString(),
              receiptNo,
            };
            const withReceipt = priorIdx >= 0
              ? priorPayments.map((p, i) => i === priorIdx ? nextEntry : p)
              : [...priorPayments, nextEntry];
            const nextPayments = discount > 0
              ? [...withReceipt, { id: `${receipt.id}:disc`, amount: discount, date: form.date, mode: 'discount', note: `Discount / kasar on receipt ${receiptNo}`, recordedAt: new Date().toISOString(), discountFor: receipt.id }]
              : withReceipt;
            const newTotal = nextPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
            await saveBill({ ...bill, paidAmount: newTotal, status: statusFor(bill, newTotal), payments: nextPayments }, { overwrite: true });
          }
        } catch { /* non-fatal: receipt is saved; user can manually update the bill */ }
      }

      toast('Receipt saved', 'success');
      if (unmatchedRef) toast(`No invoice numbered ${unmatchedRef} was found, so this receipt is saved on its own.`, 'info');
      closeForm();
      loadData();
    } catch {
      toast('Failed to save', 'error');
    }
  };

  const handleDelete = async (id) => {
    const rcp = receipts.find(r => r.id === id);
    if (rcp && !(await confirmClosedYear(rcp.date, profile))) return;
    const onOpening = rcp && isOpeningRef(rcp.againstInvoice);
    if (await confirmAction({
      title: 'Delete this receipt?',
      message: onOpening
        ? 'The receipt voucher is removed, and its payment is taken off the client\'s opening balance (which goes back up).'
        : 'The receipt voucher is removed from your records. The underlying invoice payment (if this was linked to one) stays intact.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })) {
      try {
        if (onOpening) await syncOpeningPayment(rcp.clientName, rcp.receiptNo, null).catch(() => {});
        await deleteReceipt(id); toast('Deleted', 'success'); loadData();
      }
      catch { toast('Failed to delete', 'error'); }
    }
  };

  const printReceipt = (receipt) => {
    setPreviewReceipt(receipt);
    setTimeout(() => {
      const el = receiptRef.current;
      if (!el) return;
      const printWindow = window.open('', '_blank');
      // v1.10.74 - a blocked pop-up returns null; this used to fail silently.
      if (!printWindow) {
        toast('Your browser blocked the print window. Allow pop-ups for this app and try again.', 'warning');
        setPreviewReceipt(null);
        return;
      }
      printWindow.document.write(`
        <html><head><title>Receipt ${receipt.receiptNo}</title>
        <style>
          body { font-family: 'Inter', Arial, sans-serif; margin: 0; padding: 2rem; color: #1a1a2e; }
          .receipt-box { max-width: 600px; margin: 0 auto; border: 2px solid #e2e8f0; border-radius: 8px; padding: 2rem; }
          .receipt-header { text-align: center; margin-bottom: 1.5rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 1rem; }
          .receipt-title { font-size: 1.5rem; font-weight: 800; color: #0f172a; margin: 0; }
          .receipt-subtitle { font-size: 0.8rem; color: #64748b; margin: 0.25rem 0 0; }
          .receipt-row { display: flex; justify-content: space-between; padding: 0.5rem 0; font-size: 0.9rem; border-bottom: 1px solid #f1f5f9; }
          .receipt-label { color: #64748b; font-weight: 500; }
          .receipt-value { color: #1e293b; font-weight: 600; }
          .receipt-amount { font-size: 1.5rem; font-weight: 800; color: #1e40af; text-align: center; margin: 1.5rem 0; padding: 1rem; background: #eff6ff; border-radius: 8px; }
          .receipt-words { font-size: 0.85rem; color: #334155; font-style: italic; text-align: center; margin-bottom: 1.5rem; }
          .receipt-footer { display: flex; justify-content: space-between; margin-top: 3rem; padding-top: 1rem; }
          .receipt-sig { text-align: center; }
          .receipt-sig-line { width: 180px; border-bottom: 1.5px solid #1e293b; margin-bottom: 0.25rem; }
          .receipt-sig-label { font-size: 0.75rem; color: #64748b; }
          .business-name { font-size: 1.1rem; font-weight: 700; margin-bottom: 0.25rem; }
          .business-details { font-size: 0.75rem; color: #64748b; }
          @media print { body { margin: 0; } .receipt-box { border: none; } }
        </style></head><body>
        ${el.innerHTML}
        <script>window.print(); window.close();</script>
        </body></html>
      `);
      printWindow.document.close();
      setPreviewReceipt(null);
    }, 100);
  };

  // v1.10.67 (#66 item 12) — no money is owed on a cancelled invoice.
  // v1.10.74 - nor on quotes, challans or credit notes: real sales only.
  const unpaidBills = bills.filter(b => b.status !== 'paid' && countsAsSales(b));

  // v1.10.66 (#64 item 2) — receipts saved before this release carry no
  // business. As with expenses they are never assigned automatically: only the
  // user knows which business took the money.
  const unassignedReceipts = receipts.filter(isUnassignedToBusiness);
  const assignUnassignedReceipts = async () => {
    await Promise.all(unassignedReceipts.map(r => saveReceipt({
      ...r,
      ownerGstin: profile?.gstin || '',
      ownerName: profile?.businessName || '',
    })));
    loadData();
  };

  return (
    <div className="dashboard-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div>
            <h1 className="page-title">Receipts <HelpButton title="Receipts — how to use" doc="receipts" size={16} /></h1>
            <p className="page-subtitle">Generate payment receipts for clients</p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={18} /> New Receipt</button>
      </div>

      <UnassignedBanner
        count={unassignedReceipts.length}
        businessName={profile?.businessName}
        noun="receipt"
        onAssign={assignUnassignedReceipts}
      />

      {/* Add Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <h3 className="section-title">
              {editingId ? 'Edit Payment Receipt' : 'New Payment Receipt'}
              <HelpButton title={editingId ? 'Edit Payment Receipt' : 'New Payment Receipt'} doc={editingId ? 'receipts#edit-receipt' : 'receipts#new-receipt'} size={16} />
            </h3>

            {/* Divtech Hisaab - client opening balances still open. */}
            {!form.againstInvoice && openings.some(o => openingDue(o) > 0.005) && (
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label">Quick Select — Opening Balances<HelpButton title="Receipts against an opening balance" doc="clients#opening-receipts" size={14} /></label>
                <div className="client-picker" style={{ maxHeight: '120px', overflowY: 'auto' }}>
                  {openings.filter(o => openingDue(o) > 0.005)
                    .filter(o => !form.clientName.trim() || o.name.toLowerCase().includes(form.clientName.trim().toLowerCase()))
                    .slice(0, 50).map(o => (
                      <button key={o.id} className="client-picker-item" onClick={() => selectOpening(o)}>
                        <div>
                          <strong>{o.name}</strong>
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Opening balance</span>
                        </div>
                        <span style={{ fontWeight: 600 }}>{formatCurrency(openingDue(o))}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Quick select from unpaid invoices */}
            {unpaidBills.length > 0 && !form.againstInvoice && (
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label">Quick Select — Unpaid Invoices<HelpButton title="Quick Select — Unpaid Invoices" doc="receipts#quick-select" size={14} /></label>
                {/* v1.10.57 — reported (#44 item 2, @sangwanmail-eng):
                    "payment receipt overlapped". This capped the height of
                    `.client-picker`, which has no overflow handling — the
                    class that scrolls is `.client-picker-list`. Ten unpaid
                    invoices in a 150px box with nothing to clip them simply
                    spilled out and painted over Receipt No / Date / Amount
                    underneath. Adding overflow makes the cap actually mean
                    something. */}
                <div className="client-picker" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                  {/* v1.10.74 - was 10; the box scrolls, so show more. */}
                  {unpaidBills.slice(0, 50).map(bill => (
                    <button key={bill.id} className="client-picker-item" onClick={() => selectInvoice(bill)}>
                      <div>
                        <strong>{bill.clientName}</strong>
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{bill.invoiceNumber}</span>
                      </div>
                      {/* v1.10.23 — hide the outstanding chip on overpaid
                          bills (they don't need another receipt). */}
                      {(bill.totalAmount - (bill.paidAmount || 0)) > 0.005 && (
                        <span style={{ fontWeight: 600 }}>{formatCurrency(bill.totalAmount - (bill.paidAmount || 0))}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Receipt No</label>
                <input type="text" className="form-input" value={form.receiptNo} onChange={e => updateField('receiptNo', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input type="date" className="form-input" value={form.date} onChange={e => updateField('date', e.target.value)} />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Received From (Client Name) *</label>
                <input type="text" className="form-input" value={form.clientName} onChange={e => updateField('clientName', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Amount *</label>
                <input type="number" className="form-input" value={form.amount} onChange={e => updateField('amount', e.target.value)} min="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Payment Mode</label>
                <select className="form-input" value={form.paymentMode} onChange={e => updateField('paymentMode', e.target.value)}>
                  {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <MoneyAccountSelect id="rcp-account" mode={{ 'Bank Transfer': 'bank-transfer', UPI: 'upi', Cheque: 'cheque', Card: 'card' }[form.paymentMode] || form.paymentMode}
                value={form.account} onChange={(v) => updateField('account', v)} label="Received in" />
              <div className="form-group">
                <label className="form-label" title="A small balance the customer will not pay (rate difference, rounding). It is settled with this receipt and goes to Discount allowed.">Discount / kasar</label>
                <input type="number" className="form-input" value={form.discount} onChange={e => updateField('discount', e.target.value)} min="0" placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Reference / Transaction No</label>
                <input type="text" className="form-input" value={form.referenceNo} onChange={e => updateField('referenceNo', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Against Invoice</label>
                <input type="text" className="form-input" list="rcp-against" value={form.againstInvoice} onChange={e => updateField('againstInvoice', e.target.value)} placeholder="e.g. INV/2025-26/0001 or Opening balance" />
                <datalist id="rcp-against"><option value={OPENING_REF} /></datalist>
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Note (optional)</label>
                <input type="text" className="form-input" value={form.note} onChange={e => updateField('note', e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn btn-secondary" onClick={closeForm}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>Save Receipt</button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden receipt for printing */}
      {previewReceipt && (
        <div style={{ position: 'absolute', left: '-9999px' }} ref={receiptRef}>
          <div className="receipt-box">
            <div className="receipt-header">
              <p className="business-name">{profile.businessName || 'Your Business'}</p>
              <p className="business-details">{profile.address}</p>
              {profile.gstin && <p className="business-details">GSTIN: {profile.gstin}</p>}
              <h2 className="receipt-title">PAYMENT RECEIPT</h2>
            </div>
            <div className="receipt-row"><span className="receipt-label">Receipt No:</span><span className="receipt-value">{previewReceipt.receiptNo}</span></div>
            <div className="receipt-row"><span className="receipt-label">Date:</span><span className="receipt-value">{new Date(previewReceipt.date).toLocaleDateString('en-IN')}</span></div>
            <div className="receipt-row"><span className="receipt-label">Received From:</span><span className="receipt-value">{previewReceipt.clientName}</span></div>
            {/* v1.10.74 - the address was saved but never printed. */}
            {previewReceipt.clientAddress && <div className="receipt-row"><span className="receipt-label">Address:</span><span className="receipt-value">{previewReceipt.clientAddress}</span></div>}
            <div className="receipt-row"><span className="receipt-label">Payment Mode:</span><span className="receipt-value">{previewReceipt.paymentMode}</span></div>
            {previewReceipt.referenceNo && <div className="receipt-row"><span className="receipt-label">Reference No:</span><span className="receipt-value">{previewReceipt.referenceNo}</span></div>}
            {previewReceipt.againstInvoice && <div className="receipt-row"><span className="receipt-label">Against Invoice:</span><span className="receipt-value">{previewReceipt.againstInvoice}</span></div>}
            <div className="receipt-amount">{formatCurrency(previewReceipt.amount)}</div>
            <p className="receipt-words">{numberToWords(previewReceipt.amount)}</p>
            {previewReceipt.note && <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Note: {previewReceipt.note}</p>}
            <div className="receipt-footer">
              <div className="receipt-sig"><div className="receipt-sig-line"></div><span className="receipt-sig-label">Received By</span></div>
              <div className="receipt-sig"><div className="receipt-sig-line"></div><span className="receipt-sig-label">Authorized Signatory</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="glass-panel p-4 mb-6">
        <div className="search-box" style={{ maxWidth: '400px' }}>
          <Search size={16} className="search-icon" />
          <input type="text" placeholder="Search receipts..." value={search}
            onChange={e => setSearch(e.target.value)} className="search-input" />
        </div>
      </div>

      {/* Receipts Table */}
      <div className="glass-panel">
        <div className="table-header"><h3>Payment Receipts<HelpButton title="Payment Receipts" doc="receipts#receipt-list" size={16} /></h3></div>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <Receipt size={48} />
            <p>{receipts.length === 0 ? 'No receipts generated yet.' : 'No receipts match your search.'}</p>
            {receipts.length === 0 && <button className="btn btn-primary" onClick={openAdd}><Plus size={18} /> Create Receipt</button>}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table" style={{ minWidth: '700px' }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Receipt No</th>
                  <th>Client</th>
                  <th>Against Invoice</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Mode</th>
                  <th className="col-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(rcp => (
                  <tr key={rcp.id}>
                    <td className="text-muted">{rcp.date ? new Date(rcp.date).toLocaleDateString('en-IN') : ''}</td>
                    <td><span className="invoice-badge">{rcp.receiptNo}</span></td>
                    <td className="font-medium">{rcp.clientName}</td>
                    <td className="text-muted">{rcp.againstInvoice || '-'}</td>
                    <td style={{ textAlign: 'right' }} className="font-bold">{formatCurrency(rcp.amount)}</td>
                    <td className="text-muted">{rcp.paymentMode}</td>
                    <td>
                      <div className="table-actions">
                        <button className="icon-btn icon-btn-blue" onClick={() => printReceipt(rcp)} title="Print"><Printer size={15} /></button>
                        <button className="icon-btn" onClick={() => openEdit(rcp)} title="Edit"><Pencil size={15} /></button>
                        <button className="icon-btn icon-btn-red" onClick={() => handleDelete(rcp.id)} title="Delete"><Trash2 size={15} /></button>
                      </div>
                    </td>
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
