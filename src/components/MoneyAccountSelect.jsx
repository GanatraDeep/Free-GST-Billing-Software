// Divtech Hisaab - which bank account money by bank, UPI, cheque or card went
// through: the main Bank (the Bank book), another bank account or a CC / OD
// account (Accounts screen). Shown only when such accounts exist and the mode
// is not cash. The value is '' (main Bank) or 'acc:<id>'; it is saved as
// `account` on the receipt / payment / expense (utils/ledgers.js modeAccount).
import { useEffect, useState } from 'react';
import { getAllAccounts, getProfile } from '../store';
import { belongsToProfile } from '../utils';

let cache = null;
export const MONEY_GROUPS = ['bank-accounts', 'cc'];
export async function loadMoneyAccounts(force = false) {
  if (!cache || force) {
    cache = Promise.all([getAllAccounts().catch(() => []), getProfile().catch(() => null)])
      .then(([list, prof]) => (list || []).filter((a) => MONEY_GROUPS.includes(a.group) && belongsToProfile(a, prof)).sort((a, b) => a.name.localeCompare(b.name)));
  }
  return cache;
}
export const isCashMode = (mode) => String(mode || '').trim().toLowerCase() === 'cash';
const NOT_MONEY = ['other', 'discount', 'credit', ''];
export const showsBankChoice = (mode) => !isCashMode(mode) && !NOT_MONEY.includes(String(mode || '').trim().toLowerCase());

export function useMoneyAccounts() {
  const [list, setList] = useState([]);
  useEffect(() => { let live = true; loadMoneyAccounts(true).then((l) => { if (live) setList(l); }); return () => { live = false; }; }, []);
  return list;
}

export default function MoneyAccountSelect({ mode, value, onChange, id = 'money-account', label = 'Bank account', style, className = 'form-input' }) {
  const list = useMoneyAccounts();
  if (!list.length || !showsBankChoice(mode)) return null;
  return (
    <div className="form-group" style={style}>
      <label className="form-label" htmlFor={id}>{label}</label>
      <select id={id} className={className} value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Bank (Bank book)</option>
        {list.map((a) => <option key={a.id} value={`acc:${a.id}`}>{a.name}{a.group === 'cc' ? ' (CC / OD)' : ''}</option>)}
      </select>
    </div>
  );
}
