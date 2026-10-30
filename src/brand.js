// Divtech Hisaab - the company details shown in the app. Change them here.
export const BRAND = {
  app: 'Divtech Hisaab',
  company: 'Divtech',
  site: 'https://divtech.in',
  siteLabel: 'divtech.in',
  email: 'hello@divtech.in',
  phone: '+91 94299 11067',
  whatsapp: '919429911067',
  repo: 'https://github.com/GanatraDeep/free-gst-billing-software',
};

// WhatsApp / email links that open with the renewal request already written.
export const renewWhatsAppUrl = (shop = '', expires = '') => {
  const text = `Hello Divtech, I would like to ${expires ? 'renew' : 'start'} my ${BRAND.app} subscription.`
    + (shop ? `\nShop: ${shop}` : '')
    + (expires ? `\nCurrent plan ends: ${expires}` : '');
  return `https://wa.me/${BRAND.whatsapp}?text=${encodeURIComponent(text)}`;
};

export const renewEmailUrl = (shop = '', expires = '') => {
  const subject = `${BRAND.app} subscription${shop ? ` - ${shop}` : ''}`;
  const body = `Hello Divtech,\n\nI would like to ${expires ? 'renew' : 'start'} my ${BRAND.app} subscription.\n`
    + (shop ? `Shop: ${shop}\n` : '')
    + (expires ? `Current plan ends: ${expires}\n` : '');
  return `mailto:${BRAND.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};
