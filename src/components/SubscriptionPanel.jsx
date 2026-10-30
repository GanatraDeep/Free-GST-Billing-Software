// Divtech Hisaab - subscription status and license key entry.
// Shown on Support & Subscription and inside the reminder modal. The app
// always works; the subscription only decides whether new updates install.
import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, KeyRound, MessageCircle, Mail, Phone } from 'lucide-react';
import { toast } from './Toast';
import { confirmAction } from './ConfirmModal';
import { BRAND, renewWhatsAppUrl, renewEmailUrl } from '../brand';

export const LICENSE_EVENT = 'divtech-license-changed';
export const EXPIRING_SOON_DAYS = 15;

export const fmtDay = (day) => {
  if (!day) return '';
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function useLicense() {
  const [status, setStatus] = useState(null);
  const reload = useCallback(async () => {
    try {
      const r = await fetch('/api/license');
      if (r.ok) setStatus(await r.json());
    } catch { /* server not reachable yet */ }
  }, []);
  useEffect(() => {
    const t = setTimeout(reload, 0);
    window.addEventListener(LICENSE_EVENT, reload);
    return () => { clearTimeout(t); window.removeEventListener(LICENSE_EVENT, reload); };
  }, [reload]);
  return [status, reload];
}

// One summary for the badge, the reminder and the update window.
export function describeLicense(s) {
  if (!s) return { tone: 'muted', title: 'Checking subscription…', text: '' };
  if (s.state === 'active' && s.daysLeft <= EXPIRING_SOON_DAYS) {
    return {
      tone: 'warn',
      title: s.daysLeft === 0 ? 'Subscription ends today' : `Subscription ends in ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'}`,
      text: `Updates are included until ${fmtDay(s.expires)}. Renew now so you keep getting new features and fixes.`,
    };
  }
  if (s.state === 'active') {
    return { tone: 'ok', title: 'Subscription active', text: `Updates are included until ${fmtDay(s.expires)} (${s.daysLeft} days left).` };
  }
  if (s.state === 'expired') {
    return {
      tone: 'bad',
      title: 'Subscription expired',
      text: `It ended on ${fmtDay(s.expires)}. ${BRAND.app} keeps working with all your data; only new updates need a renewal.`,
    };
  }
  if (s.state === 'invalid') {
    return { tone: 'bad', title: 'License key not valid', text: `${s.reason || ''} ${BRAND.app} keeps working; updates need a valid key.`.trim() };
  }
  return {
    tone: 'muted',
    title: 'No subscription yet',
    text: `${BRAND.app} works fully without one. A subscription gives you every new update: new features, GST changes and fixes.`,
  };
}

const TONES = {
  ok: { color: '#16a34a', bg: 'rgba(22,163,74,0.1)', Icon: ShieldCheck },
  warn: { color: '#d97706', bg: 'rgba(217,119,6,0.12)', Icon: ShieldAlert },
  bad: { color: '#dc2626', bg: 'rgba(220,38,38,0.1)', Icon: ShieldX },
  muted: { color: 'var(--text-secondary)', bg: 'var(--bg-secondary)', Icon: KeyRound },
};

export default function SubscriptionPanel({ status, onChanged, compact = false, shopName = '' }) {
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showEntry, setShowEntry] = useState(false);
  const d = describeLicense(status);
  const tone = TONES[d.tone];
  const hasKey = status && status.state !== 'none';
  const entryOpen = showEntry || !hasKey || status?.state === 'invalid';
  const shop = status?.shop || shopName;

  const save = async (value) => {
    setSaving(true);
    setError('');
    try {
      const r = await fetch('/api/license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: value }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) { setError(data.error || 'Could not save the key.'); return; }
      setKey('');
      setShowEntry(false);
      window.dispatchEvent(new Event(LICENSE_EVENT));
      onChanged?.(data.status);
      if (value) toast(`License key saved. ${describeLicense(data.status).title}.`, 'success', 6000);
      else toast('License key removed.', 'info', 4000);
    } catch (e) {
      setError(`Could not reach the app's server: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start', padding: '0.9rem 1rem', borderRadius: 10, background: tone.bg }}>
        <tone.Icon size={26} style={{ color: tone.color, flexShrink: 0, marginTop: 2 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: tone.color }}>{d.title}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem', lineHeight: 1.5 }}>{d.text}</div>
          {status?.shop && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              Licensed to <b style={{ color: 'var(--text-primary)' }}>{status.shop}</b>
              {status.gstin ? ` · ${status.gstin}` : ''}
              {status.keyEnd ? ` · key …${status.keyEnd}` : ''}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.9rem' }}>
        <a className="btn btn-primary" href={renewWhatsAppUrl(shop, status?.expires)} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={16} /> {hasKey && status?.state !== 'invalid' ? 'Renew on WhatsApp' : 'Get a subscription on WhatsApp'}
        </a>
        <a className="btn btn-secondary" href={renewEmailUrl(shop, status?.expires)}><Mail size={16} /> {BRAND.email}</a>
        {!compact && <a className="btn btn-secondary" href={`tel:${BRAND.phone.replace(/\s/g, '')}`}><Phone size={16} /> {BRAND.phone}</a>}
      </div>

      {entryOpen ? (
        <form style={{ marginTop: '1rem' }} onSubmit={(e) => { e.preventDefault(); if (key.trim()) save(key); }}>
          <label htmlFor="divtech-license-key" style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.35rem' }}>
            {hasKey ? 'Enter your new license key' : 'Already have a license key? Paste it here'}
          </label>
          <textarea id="divtech-license-key" className="form-input" rows={compact ? 2 : 3} value={key}
            onChange={(e) => { setKey(e.target.value); setError(''); }}
            placeholder="DH1-…" spellCheck={false} autoComplete="off"
            style={{ width: '100%', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: '0.8rem', resize: 'vertical' }} />
          {error && <div role="alert" style={{ color: '#dc2626', fontSize: '0.82rem', marginTop: '0.35rem' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-primary" disabled={saving || !key.trim()}>
              <KeyRound size={16} /> {saving ? 'Checking…' : 'Save license key'}
            </button>
            {hasKey && showEntry && (
              <button type="button" className="btn btn-secondary" onClick={() => { setShowEntry(false); setKey(''); setError(''); }}>Cancel</button>
            )}
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', fontSize: '0.82rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn-link" onClick={() => setShowEntry(true)}
            style={{ background: 'none', border: 0, color: 'var(--primary)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', padding: 0 }}>
            Enter a new license key
          </button>
          {!compact && (
            <button type="button" className="btn-link" disabled={saving}
              onClick={async () => {
                if (await confirmAction({ title: 'Remove the license key?', message: 'The app keeps working with all your data, but updates stop until a key is entered again.', confirmLabel: 'Remove key', tone: 'warning' })) save('');
              }}
              style={{ background: 'none', border: 0, color: 'var(--text-muted)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', padding: 0 }}>
              Remove key
            </button>
          )}
        </div>
      )}
    </div>
  );
}
