// Divtech Hisaab - every record the accounts are worked out from, for the
// business selected now (utils/ledgers.js turns them into postings).
import { useCallback, useEffect, useState } from 'react';
import {
  getAllBills, getAllReceipts, getAllExpenses, getAllPurchases, getAllClients, getAllSuppliers,
  getAllProducts, getAllOpeningBalances, getAllCashEntries, getAllAccounts, getAllVouchers, getAllStockAdjustments, getProfile,
} from '../store';
import { belongsToProfile } from '../utils';

export async function loadBooks() {
  const [bills, receipts, expenses, purchases, clients, suppliers, products, openings, cashEntries, accounts, vouchers, profile, stockAdjustments] = await Promise.all([
    getAllBills(), getAllReceipts(), getAllExpenses(), getAllPurchases().catch(() => []), getAllClients().catch(() => []),
    getAllSuppliers().catch(() => []), getAllProducts().catch(() => []), getAllOpeningBalances().catch(() => []),
    getAllCashEntries().catch(() => []), getAllAccounts().catch(() => []), getAllVouchers().catch(() => []), getProfile().catch(() => null),
    getAllStockAdjustments().catch(() => []),
  ]);
  const mine = (rows) => (rows || []).filter((r) => belongsToProfile(r, profile));
  return {
    profile,
    data: {
      bills: mine(bills), receipts: mine(receipts), expenses: mine(expenses), purchases: mine(purchases),
      openings: mine(openings), cashEntries: mine(cashEntries), accounts: mine(accounts), vouchers: mine(vouchers),
      stockAdjustments: mine(stockAdjustments),
      clients: clients || [], suppliers: suppliers || [], products: products || [],
    },
  };
}

export default function useBooks() {
  const [state, setState] = useState({ data: null, profile: null, error: false });
  const reload = useCallback(() => loadBooks()
    .then((s) => setState({ ...s, error: false }))
    .catch(() => setState((p) => ({ ...p, error: true }))), []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}
