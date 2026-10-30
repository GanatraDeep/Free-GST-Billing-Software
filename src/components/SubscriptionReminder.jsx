// Divtech Hisaab - the subscription reminder. Shows at most once a day, a few
// seconds after the app opens, only when there is something to act on: no
// key, a key that is not valid, a plan that ended, or one ending within
// EXPIRING_SOON_DAYS. It never blocks work: close it and carry on.
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import SubscriptionPanel, { useLicense, describeLicense, EXPIRING_SOON_DAYS } from './SubscriptionPanel';
import { BRAND } from '../brand';

const SEEN_KEY = 'divtech_subscriptionReminderDay';
const today = () => new Date().toISOString().slice(0, 10);

const needsReminder = (s) => !!s && (s.state === 'none' || s.state === 'invalid' || s.state === 'expired'
  || (s.state === 'active' && s.daysLeft <= EXPIRING_SOON_DAYS));

export default function SubscriptionReminder({ suppressed = false, shopName = '' }) {
  const [status] = useLicense();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (suppressed || !needsReminder(status)) return undefined;
    let seen = '';
    try { seen = localStorage.getItem(SEEN_KEY) || ''; } catch { /* storage off */ }
    if (seen === today()) return undefined;
    const t = setTimeout(() => setOpen(true), 8000);
    return () => clearTimeout(t);
  }, [status, suppressed]);

  const close = () => {
    try { localStorage.setItem(SEEN_KEY, today()); } catch { /* storage off */ }
    setOpen(false);
  };

  if (!open || suppressed) return null;
  const d = describeLicense(status);
  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="sub-reminder-title"
        style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <div>
            <h3 id="sub-reminder-title" className="section-title" style={{ margin: 0 }}>{BRAND.app} subscription</h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Your billing keeps working either way. The subscription brings new updates.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={close} title="Close" aria-label="Close"><X size={18} /></button>
        </div>
        <SubscriptionPanel status={status} compact shopName={shopName} onChanged={(s) => { if (!needsReminder(s)) close(); }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="btn btn-secondary" onClick={close}>
            {d.tone === 'warn' ? 'Remind me tomorrow' : 'Continue to the app'}
          </button>
        </div>
      </div>
    </div>
  );
}
