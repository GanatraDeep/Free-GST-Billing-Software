// Divtech Hisaab - license key checks (node scripts/license-test.mjs).
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { signLicense, verifyLicenseKey, licenseStatus, licenseAllowsRelease, writeLicenseKey, readLicenseKey } from '../license.js';

let failed = 0;
const eq = (a, b, msg) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { failed += 1; console.log(`  x ${msg}\n    got ${JSON.stringify(a)}\n    want ${JSON.stringify(b)}`); } else console.log(`  ✓ ${msg}`);
};

const { privateKey } = crypto.generateKeyPairSync('ed25519');
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const pub = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('base64');
const other = crypto.createPublicKey(crypto.generateKeyPairSync('ed25519').privateKey).export({ type: 'spki', format: 'der' }).toString('base64');

const key = signLicense({ s: 'Ganatra Oil Traders', g: '24ABCDE1234F1Z5', e: '2027-10-31', i: '2026-10-31', id: 'ab12cd34' }, pem);
eq(verifyLicenseKey(key, pub).ok, true, 'A signed key verifies');
eq(verifyLicenseKey(key, pub).shop, 'Ganatra Oil Traders', 'Shop name comes from the key');
eq(verifyLicenseKey(`  ${key.slice(0, 20)}\n${key.slice(20)} `, pub).ok, true, 'Spaces and line breaks from WhatsApp are ignored');
eq(verifyLicenseKey(key, other).ok, false, 'A key signed by someone else is refused');
eq(verifyLicenseKey(key, '').ok, false, 'No public key set up: every key is refused');
const [body, sig] = [key.slice(0, key.lastIndexOf('.')), key.slice(key.lastIndexOf('.') + 1)];
const forged = signLicense({ s: 'Ganatra Oil Traders', e: '2099-12-31', i: '2026-10-31' }, crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }));
eq(verifyLicenseKey(`${forged.slice(0, forged.lastIndexOf('.'))}.${sig}`, pub).ok, false, 'A changed expiry date breaks the signature');
eq(verifyLicenseKey(`${body}.${sig.slice(0, -2)}`, pub).ok, false, 'A cut-off key is refused');
eq(verifyLicenseKey('hello', pub).ok, false, 'Random text is refused');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-lic-'));
eq(licenseStatus(dir, new Date(), pub).state, 'none', 'No key saved: none');
writeLicenseKey(dir, key);
eq(readLicenseKey(dir), key, 'Saved key reads back');
const active = licenseStatus(dir, new Date('2027-10-31T23:00:00'), pub);
eq([active.state, active.daysLeft], ['active', 0], 'Active on the expiry day itself');
const expired = licenseStatus(dir, new Date('2027-11-01T09:00:00'), pub);
eq([expired.state, expired.daysLeft], ['expired', -1], 'Expired the day after');
eq(licenseAllowsRelease(expired, '2027-10-20T10:00:00Z'), true, 'Expired, but a release from before the expiry is still covered');
eq(licenseAllowsRelease(active, '2027-11-05T10:00:00Z'), false, 'A release after the expiry is not covered, whatever the PC clock says');
eq(licenseAllowsRelease(active, ''), true, 'Unknown release date: allowed while active');
eq(licenseAllowsRelease(expired, ''), false, 'Unknown release date: refused once expired');
eq(licenseAllowsRelease({ state: 'none' }, '2026-01-01'), false, 'No key: no updates');
writeLicenseKey(dir, 'DH1-garbage.xx');
eq(licenseStatus(dir, new Date(), pub).state, 'invalid', 'A damaged saved key is reported as invalid');
writeLicenseKey(dir, '');
eq(fs.existsSync(path.join(dir, 'license.json')), false, 'Removing the key deletes the file');
fs.rmSync(dir, { recursive: true, force: true });

if (failed) { console.log(`\n  ${failed} license check(s) failed`); process.exit(1); }
console.log('\n  All license checks passed');
