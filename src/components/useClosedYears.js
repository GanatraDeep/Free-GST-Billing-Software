// Divtech Hisaab - closed financial years. Closing a year (Final accounts →
// Year end) does not delete or lock anything; saving or deleting an entry
// dated in a closed year asks first, so figures already given to the CA do
// not change by mistake. Stored in meta.json: { businessKey: { '2025-26': { closedOn } } }.
import { getMeta, setMeta } from '../store';
import { businessKeyOf, getFinancialYearLabel, parseLocalDate } from '../utils';
import { confirmAction } from './ConfirmModal';

export const CLOSED_YEARS_KEY = 'closedYears';
export const getClosedYears = async () => (await getMeta(CLOSED_YEARS_KEY).catch(() => null)) || {};
export async function setYearClosed(profile, fyLabel, closed) {
  const all = await getClosedYears();
  const key = businessKeyOf(profile) || 'default';
  const mine = { ...(all[key] || {}) };
  if (closed) mine[fyLabel] = { closedOn: new Date().toISOString() }; else delete mine[fyLabel];
  await setMeta(CLOSED_YEARS_KEY, { ...all, [key]: mine });
}
export const closedYearsOf = (all, profile) => all?.[businessKeyOf(profile) || 'default'] || {};

// true when it is fine to go ahead (the year is open, or the user says so).
export async function confirmClosedYear(date, profile) {
  if (!date) return true;
  const fy = getFinancialYearLabel(parseLocalDate(date));
  const closed = closedYearsOf(await getClosedYears(), profile)[fy];
  if (!closed) return true;
  return confirmAction({
    title: `FY ${fy} is closed`,
    message: `This entry is dated ${date}, in a year you closed on ${new Date(closed.closedOn).toLocaleDateString('en-IN')}. Changing it changes that year's accounts (and the opening balances after it). Go ahead?`,
    confirmLabel: 'Change it anyway', tone: 'warning',
  });
}
