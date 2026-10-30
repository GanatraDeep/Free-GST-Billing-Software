// Divtech Hisaab - Support & Subscription: the subscription status and key,
// how to reach Divtech, what's new, the problem log and credits.
import { useEffect, useState } from 'react';
import { Mail, Globe, Phone, MessageCircle, Code, Wrench, Database, LifeBuoy, Smartphone, Workflow } from 'lucide-react';
import { getProfile } from '../store';
import WhatsNew from './WhatsNew';
import ProblemLog from './ProblemLog';
import HelpButton from './HelpButton';
import { SafePrivateSection } from './SafePrivateNote';
import SubscriptionPanel, { useLicense } from './SubscriptionPanel';
import { BRAND } from '../brand';

const SERVICES = [
  { icon: Wrench, title: `Customising ${BRAND.app}`, text: 'Your own invoice layout, reports or features for your trade.' },
  { icon: Database, title: 'Setup & data migration', text: 'Installation, moving your data from other software or Excel, and training.' },
  { icon: LifeBuoy, title: 'Support on call', text: 'Help over phone or WhatsApp when something is not working.' },
  { icon: Code, title: 'Custom software & websites', text: 'Websites, web apps and business tools built for how you work.' },
  { icon: Smartphone, title: 'Mobile apps', text: 'Android and iPhone apps for your business or customers.' },
  { icon: Workflow, title: 'Automation', text: 'Automate the repetitive work in the software you already use.' },
];

export default function SupportView() {
  const [status, reload] = useLicense();
  const [businessName, setBusinessName] = useState('');
  useEffect(() => { getProfile().then((p) => setBusinessName(p?.businessName || '')).catch(() => {}); }, []);

  const card = { padding: '1.25rem 1.5rem' };
  const contactRow = { display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.7rem 0', borderTop: '1px solid var(--border-color)', color: 'inherit', textDecoration: 'none' };

  return (
    <div className="dashboard-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Support &amp; Subscription <HelpButton title="Support & Subscription" doc="support" size={16} style={{ marginLeft: 6 }} /></h1>
          <p className="page-subtitle">Your {BRAND.app} plan, and how to reach {BRAND.company}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
        <div className="glass-panel" style={card}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Subscription</h3>
          <SubscriptionPanel status={status} onChanged={reload} shopName={businessName} />
          <p style={{ margin: '1rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Your invoices, stock, accounts and reports always keep working, with or without a subscription.
            The subscription covers every update released while it is active: new features, GST rule changes and fixes.
          </p>
        </div>

        <div className="glass-panel" style={card}>
          <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>Contact {BRAND.company}</h3>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>For help, training, renewals or a new feature.</p>
          <a style={contactRow} href={`https://wa.me/${BRAND.whatsapp}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={20} style={{ color: '#16a34a', flexShrink: 0 }} />
            <span><span style={{ display: 'block', fontWeight: 600 }}>WhatsApp</span><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{BRAND.phone}</span></span>
          </a>
          <a style={contactRow} href={`tel:${BRAND.phone.replace(/\s/g, '')}`}>
            <Phone size={20} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <span><span style={{ display: 'block', fontWeight: 600 }}>Call</span><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{BRAND.phone}</span></span>
          </a>
          <a style={contactRow} href={`mailto:${BRAND.email}?subject=${encodeURIComponent(`${BRAND.app} help`)}`}>
            <Mail size={20} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <span><span style={{ display: 'block', fontWeight: 600 }}>Email</span><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{BRAND.email}</span></span>
          </a>
          <a style={contactRow} href={BRAND.site} target="_blank" rel="noopener noreferrer">
            <Globe size={20} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <span><span style={{ display: 'block', fontWeight: 600 }}>Website</span><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{BRAND.siteLabel}</span></span>
          </a>
        </div>
      </div>

      <SafePrivateSection style={{ marginBottom: '1.25rem' }} />

      <WhatsNew />

      <ProblemLog />

      <div className="glass-panel" style={card}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>Work with {BRAND.company}</h3>
        <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>The team behind this app builds software for businesses too.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          {SERVICES.map((w) => (
            <div key={w.title} style={{ display: 'flex', gap: '0.7rem', padding: '0.85rem', borderRadius: 8, background: 'var(--bg-secondary)' }}>
              <w.icon size={20} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{w.title}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem', lineHeight: 1.45 }}>{w.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
