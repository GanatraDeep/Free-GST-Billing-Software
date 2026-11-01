// Site-wide settings and the sidebar. The sidebar order is also the
// Previous / Next order at the foot of each page.

export const SITE = {
  name: 'Divtech Hisaab',
  // Divtech Hisaab: the help pages are built into the app and served by the
  // local server at /help/ (see scripts/copy-help.mjs), so Help works offline.
  folder: 'help',
  url: '/help/',
  publisher: { name: 'Divtech', url: 'https://divtech.in' },
  version: '1.14.3',
  repo: 'https://github.com/GanatraDeep/free-gst-billing-software',
  // Always the newest release: GitHub resolves this to the latest release's
  // file of exactly this name (see docs/RELEASE_CHECKLIST.md, step 4b).
  download: 'https://github.com/GanatraDeep/free-gst-billing-software/releases/latest/download/Divtech-Hisaab.zip',
};

// Search-result titles and descriptions for the pages people search for most.
// Other pages use their own title and the first ~155 characters of their lead.
export const SEO = {
  index: {
    title: 'Divtech Hisaab for India: documentation and user guide',
    description: 'GST billing software by Divtech for Windows, Mac and Linux. Make GST invoices, track payments and stock, and prepare GSTR-1 and GSTR-3B. No signup, works offline.',
  },
  install: {
    title: 'How to install Divtech Hisaab on Windows, Mac and Linux',
    description: 'Download one ZIP, extract it and click Install. Sets up everything on Windows without admin rights. Step-by-step install for Windows, macOS and Linux.',
  },
  'first-invoice': {
    title: 'How to make your first GST invoice (step by step)',
    description: 'Make a GST tax invoice in five minutes: add your business, the client and items. CGST, SGST or IGST is worked out for you. Save, download the PDF and send it.',
  },
  invoices: {
    title: 'How to make a GST tax invoice: every field explained',
    description: 'Every part of the invoice screen: document types, GSTIN check, HSN codes, discounts, CGST/SGST/IGST, reverse charge, TDS and TCS, e-way bill, print and WhatsApp.',
  },
  'gst-returns': {
    title: 'GSTR-1 and GSTR-3B JSON from your invoices, and GSTR-2B matching',
    description: 'Build GSTR-1 and GSTR-3B from your invoices and purchases, download the JSON for the GST portal, and match your input tax credit against GSTR-2B.',
  },
  'thermal-printing': {
    title: 'GST bill printing on 58 mm and 80 mm thermal receipt printers',
    description: 'Print GST bills on 58 mm and 80 mm thermal printers: set up the printer, the print preview, auto-print on save, what a receipt shows, and fixes for faint or cut-off prints.',
  },
};

export const NAV = [
  { title: 'Start here', pages: ['index', 'install', 'install-mac', 'install-linux', 'update', 'first-run', 'first-invoice', 'gst-basics', 'security'] },
  { title: 'Invoicing', pages: ['invoices', 'invoice-options', 'thermal-printing', 'dashboard'] },
  { title: 'Clients, stock and payments', pages: ['clients', 'products', 'receipts', 'cash-book', 'ledgers', 'recurring'] },
  { title: 'Buying', pages: ['purchases', 'freight', 'expenses'] },
  { title: 'Tax and reports', pages: ['gst-returns', 'reports', 'income-tax'] },
  { title: 'Accounts and year end', pages: ['accounts', 'final-accounts'] },
  { title: 'Setting up', pages: ['settings', 'print-settings', 'backup', 'control-panel'] },
  { title: 'Help', pages: ['shortcuts', 'troubleshooting', 'terminal', 'limitations', 'glossary', 'support'] },
];
