// Divtech Hisaab - subscription license keys.
//
// The app ALWAYS works, with or without a subscription. A subscription only
// decides whether new updates can be installed:
//
//   * A key is issued by Divtech with scripts/license-admin.mjs. It carries the
//     shop name, an optional GSTIN and an expiry date, signed with Divtech's
//     private key (Ed25519). Only the PUBLIC key is here, so a key cannot be
//     made or changed without Divtech's private key.
//   * A key covers every update RELEASED on or before its expiry date. Setting
//     the PC's clock back does not unlock newer releases, because the check
//     uses the release's own publish date from GitHub.
//   * The key is saved in data/license.json, so it survives updates and is
//     part of every data backup.
//
// Used by server.js (the in-app Subscription page and the update check) and by
// the updater scripts, which run it from the command line before downloading:
//
//   node license.js --status            prints the status as JSON
//   node license.js --allows <ISO date> exit 0 if a release published then is
//                                       covered, 3 if not (message on stdout, so
//                                       Windows PowerShell can show it safely)

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Set by `npm run license:init` (scripts/license-admin.mjs). Empty means no
// key can be valid yet, so updates stay off until Divtech sets this up.
export const LICENSE_PUBLIC_KEY = '';

export const LICENSE_PREFIX = 'DH1';
export const LICENSE_FILE = 'license.json';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// YYYY-MM-DD in the PC's local time zone (an expiry date is a calendar day).
export const localDay = (d = new Date()) => {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());

const daysBetween = (fromDay, toDay) => Math.round((new Date(`${toDay}T00:00:00`) - new Date(`${fromDay}T00:00:00`)) / 86400000);

// Keys get pasted from WhatsApp and email: drop spaces, line breaks and quotes.
export const normaliseKey = (raw) => String(raw || '').replace(/[\s"'`]+/g, '');

// The signed text is everything before the last dot, so the prefix (the key
// format version) is signed too.
export function signLicense(payload, privateKeyPem) {
  const body = `${LICENSE_PREFIX}-${b64url(JSON.stringify(payload))}`;
  const sig = crypto.sign(null, Buffer.from(body), crypto.createPrivateKey(privateKeyPem));
  return `${body}.${b64url(sig)}`;
}

// -> { ok: true, shop, gstin, expires, issued, id } or { ok: false, reason }
export function verifyLicenseKey(raw, publicKey = LICENSE_PUBLIC_KEY) {
  const key = normaliseKey(raw);
  if (!key) return { ok: false, reason: 'No license key entered.' };
  if (!publicKey) return { ok: false, reason: 'This copy of Divtech Hisaab has not been set up for subscriptions yet. Contact Divtech.' };
  const dot = key.lastIndexOf('.');
  if (!key.startsWith(`${LICENSE_PREFIX}-`) || dot < 0) return { ok: false, reason: 'This does not look like a Divtech Hisaab license key. Copy the whole key and try again.' };
  const body = key.slice(0, dot);
  let valid = false;
  try {
    const pub = crypto.createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
    valid = crypto.verify(null, Buffer.from(body), pub, fromB64url(key.slice(dot + 1)));
  } catch { valid = false; }
  if (!valid) return { ok: false, reason: 'This license key is not valid. Check that it was copied completely, or ask Divtech for a new one.' };
  let p;
  try { p = JSON.parse(fromB64url(body.slice(LICENSE_PREFIX.length + 1)).toString('utf8')); } catch { p = null; }
  if (!p || !isDay(p.e) || !String(p.s || '').trim()) return { ok: false, reason: 'This license key is damaged. Ask Divtech for a new one.' };
  return { ok: true, shop: String(p.s).trim(), gstin: String(p.g || ''), expires: p.e, issued: isDay(p.i) ? p.i : '', id: String(p.id || '') };
}

export const readLicenseKey = (dataDir) => {
  try { return normaliseKey(JSON.parse(fs.readFileSync(path.join(dataDir, LICENSE_FILE), 'utf8')).key); } catch { return ''; }
};

export const writeLicenseKey = (dataDir, key) => {
  const file = path.join(dataDir, LICENSE_FILE);
  if (!key) { fs.rmSync(file, { force: true }); return; }
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ key: normaliseKey(key), savedAt: new Date().toISOString() }, null, 2));
  fs.renameSync(tmp, file);
};

// state: 'none' (no key), 'invalid', 'active' or 'expired'.
export function licenseStatus(dataDir, now = new Date(), publicKey = LICENSE_PUBLIC_KEY) {
  const key = readLicenseKey(dataDir);
  if (!key) return { state: 'none', configured: !!publicKey };
  const v = verifyLicenseKey(key, publicKey);
  if (!v.ok) return { state: 'invalid', configured: !!publicKey, reason: v.reason };
  const today = localDay(now);
  const daysLeft = daysBetween(today, v.expires);
  return {
    state: daysLeft >= 0 ? 'active' : 'expired',
    configured: true,
    shop: v.shop,
    gstin: v.gstin,
    expires: v.expires,
    issued: v.issued,
    daysLeft,
    keyEnd: key.slice(-6),
  };
}

// Is a release published at `publishedAt` (ISO) covered by the subscription?
// Unknown publish date: fall back to "is the subscription active today".
export function licenseAllowsRelease(status, publishedAt) {
  if (!status || (status.state !== 'active' && status.state !== 'expired')) return false;
  const released = publishedAt ? localDay(publishedAt) : '';
  if (released) return released <= status.expires;
  return status.state === 'active';
}

export const subscriptionMessage = (status) => {
  if (status.state === 'none') return 'Updates need an active Divtech Hisaab subscription. Your software keeps working without one. Contact Divtech (hello@divtech.in, +91 94299 11067) to get a license key, then enter it under Support & Subscription.';
  if (status.state === 'invalid') return `The saved license key is not valid: ${status.reason}`;
  const when = status.state === 'active' ? 'runs until' : 'ended on';
  return `Your subscription ${when} ${status.expires} and covers updates released until then. This update is newer, so it needs a renewal. Your software keeps working. Renew with Divtech (hello@divtech.in, +91 94299 11067).`;
};

// ---- Command line, for the updater scripts ----
const isMain = (() => {
  try { return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
})();

if (isMain) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dataDir = path.join(here, 'data');
  const status = licenseStatus(dataDir);
  const args = process.argv.slice(2);
  if (args[0] === '--allows') {
    if (licenseAllowsRelease(status, args[1] || '')) process.exit(0);
    process.stdout.write(`${subscriptionMessage(status)}\n`);
    process.exit(3);
  } else {
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
  }
}

export const _test = { b64url, fromB64url, daysBetween };
