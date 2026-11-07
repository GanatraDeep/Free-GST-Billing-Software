// Divtech Hisaab - the closing stock valuation method chosen for the books
// (Final accounts -> Closing stock method). Saved like the other settings
// (mirrored to the server, so it is in backups). Methods: utils/ledgers.js.
import { STOCK_METHODS } from './ledgers.js';

const KEY = 'gst_stockMethod';
export const STOCK_METHOD_EVENT = 'divtech-stock-method';

export function getStockMethod() {
  try {
    const v = localStorage.getItem(KEY);
    return STOCK_METHODS.some(([k]) => k === v) ? v : 'average';
  } catch { return 'average'; }
}

export function setStockMethod(method) {
  try { localStorage.setItem(KEY, method); } catch { /* storage blocked */ }
  try { window.dispatchEvent(new CustomEvent(STOCK_METHOD_EVENT, { detail: method })); } catch { /* not a browser */ }
}
