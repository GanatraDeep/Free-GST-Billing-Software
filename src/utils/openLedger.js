// Divtech Hisaab - open the Ledgers screen on one ledger (a client, a supplier,
// an item...). The id is the one buildLedger() takes, e.g. "client:Patel Kirana".
export const LEDGER_PRESET_KEY = 'divtech_ledgerPreset';
export const openLedger = (id) => {
  try { sessionStorage.setItem(LEDGER_PRESET_KEY, id); } catch { /* the screen opens on its first ledger */ }
  window.dispatchEvent(new CustomEvent('divtech-open-view', { detail: 'ledgers' }));
};
