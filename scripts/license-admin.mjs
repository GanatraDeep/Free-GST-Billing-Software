// Divtech Hisaab - license key admin (for Divtech only, never shipped to shops).
//
// One-time setup on Divtech's own computer:
//   npm run license:init
//     Makes Divtech's signing key pair. The PRIVATE key is saved in
//     <your home folder>/.divtech-hisaab/license-private.pem and never goes
//     into the code. The PUBLIC key is written into license.js; commit and
//     push that, then publish a release so installed copies get it.
//     Back up license-private.pem (pen drive / password manager). Without it
//     you cannot issue keys that existing installs accept.
//
// Issue a key for a shop:
//   npm run license:issue -- --shop "Ganatra Oil Traders" --months 12
//   npm run license:issue -- --shop "Ganatra Oil Traders" --until 2027-10-31 --gstin 24ABCDE1234F1Z5
//     Prints the key to send on WhatsApp / email. Each key is also logged in
//     <home>/.divtech-hisaab/issued-keys.csv.
//
// Check a key:
//   npm run license:issue -- --verify "DH1-...."

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { signLicense, verifyLicenseKey, LICENSE_PUBLIC_KEY, localDay } from '../license.js';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const LICENSE_JS = path.join(ROOT, 'license.js');
const HOME_DIR = process.env.DIVTECH_LICENSE_HOME || path.join(os.homedir(), '.divtech-hisaab');
const PRIVATE_PEM = path.join(HOME_DIR, 'license-private.pem');
const LOG_CSV = path.join(HOME_DIR, 'issued-keys.csv');

const die = (msg) => { console.error(`\n  x ${msg}\n`); process.exit(1); };

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=');
      out[k] = inline !== undefined ? inline : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : true);
    } else out._.push(a);
  }
  return out;
}

const publicKeyB64 = (keyObj) => crypto.createPublicKey(keyObj).export({ type: 'spki', format: 'der' }).toString('base64');

function writePublicKeyIntoLicenseJs(pubB64) {
  const src = fs.readFileSync(LICENSE_JS, 'utf8');
  const next = src.replace(/export const LICENSE_PUBLIC_KEY = '[^']*';/, `export const LICENSE_PUBLIC_KEY = '${pubB64}';`);
  if (next === src && !src.includes(pubB64)) die('Could not find LICENSE_PUBLIC_KEY in license.js.');
  fs.writeFileSync(LICENSE_JS, next);
}

function init(args) {
  if (fs.existsSync(PRIVATE_PEM) && !args.force) {
    // Already set up: make sure license.js carries the matching public key
    // (useful on a fresh clone of the repo).
    const pub = publicKeyB64(fs.readFileSync(PRIVATE_PEM, 'utf8'));
    if (LICENSE_PUBLIC_KEY === pub) { console.log(`\n  Already set up. Private key: ${PRIVATE_PEM}\n`); return; }
    if (LICENSE_PUBLIC_KEY && !args['use-existing']) {
      die(`license.js has a DIFFERENT public key than ${PRIVATE_PEM}.\n    Keys from one will not work with the other. Run with --use-existing to put this private key's public key into license.js.`);
    }
    writePublicKeyIntoLicenseJs(pub);
    console.log(`\n  ✓ license.js now uses the public key of ${PRIVATE_PEM}\n`);
    return;
  }
  if (LICENSE_PUBLIC_KEY && !args.force) {
    die('license.js already has a public key, but its private key is not on this computer.\n    Copy license-private.pem into ' + HOME_DIR + ' from your backup.\n    (Use --force only to start over: every key already issued will stop working.)');
  }
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(HOME_DIR, { recursive: true });
  fs.writeFileSync(PRIVATE_PEM, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  writePublicKeyIntoLicenseJs(publicKeyB64(privateKey));
  console.log(`
  ✓ Signing key created.

    Private key (KEEP SECRET, BACK IT UP): ${PRIVATE_PEM}
    Public key written into: license.js

  Next: commit and push license.js, then publish a new release.
  `);
}

function addMonths(day, months) {
  const d = new Date(`${day}T00:00:00`);
  const target = new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
  // 31 Jan + 1 month -> last day of Feb, not 3 March.
  if (target.getDate() !== d.getDate()) target.setDate(0);
  return localDay(target);
}

function issue(args) {
  if (args.verify) {
    const v = verifyLicenseKey(String(args.verify));
    console.log(v.ok ? `\n  ✓ Valid. Shop: ${v.shop}${v.gstin ? ` (${v.gstin})` : ''}. Updates until ${v.expires}. Issued ${v.issued || '?'}.\n` : `\n  x ${v.reason}\n`);
    process.exit(v.ok ? 0 : 1);
  }
  if (!fs.existsSync(PRIVATE_PEM)) die(`No private key at ${PRIVATE_PEM}. Run: npm run license:init`);
  const pem = fs.readFileSync(PRIVATE_PEM, 'utf8');
  if (publicKeyB64(pem) !== LICENSE_PUBLIC_KEY) die('The public key in license.js does not match your private key. Run: npm run license:init -- --use-existing');
  const shop = String(args.shop || '').trim();
  if (!shop || shop === 'true') die('Give the shop name: --shop "Shop Name"');
  const issued = localDay();
  let expires;
  if (args.until) {
    expires = String(args.until);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) die('--until must be a date like 2027-10-31');
  } else {
    const months = Number(args.months || 12);
    if (!Number.isInteger(months) || months < 1 || months > 120) die('--months must be a whole number from 1 to 120');
    expires = addMonths(issued, months);
  }
  const payload = { s: shop, e: expires, i: issued, id: crypto.randomBytes(4).toString('hex') };
  const gstin = String(args.gstin || '').trim().toUpperCase();
  if (gstin && gstin !== 'TRUE') payload.g = gstin;
  const key = signLicense(payload, pem);
  const check = verifyLicenseKey(key);
  if (!check.ok) die(`Made a key that does not verify: ${check.reason}`);
  fs.mkdirSync(HOME_DIR, { recursive: true });
  if (!fs.existsSync(LOG_CSV)) fs.writeFileSync(LOG_CSV, 'issued,shop,gstin,expires,id,key\n');
  const csv = (s) => `"${String(s).replace(/"/g, '""')}"`;
  fs.appendFileSync(LOG_CSV, [issued, shop, payload.g || '', expires, payload.id, key].map(csv).join(',') + '\n');
  console.log(`
  ✓ License key for ${shop}${payload.g ? ` (${payload.g})` : ''}
    Updates included until: ${expires}

${key}

  Send this whole key to the shop. They paste it in
  Divtech Hisaab > Support & Subscription > Enter license key.
  (Logged in ${LOG_CSV})
`);
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
if (cmd === 'init') init(args);
else if (cmd === 'issue') issue(args);
else die('Use: license-admin.mjs init | issue --shop "Name" [--months 12 | --until YYYY-MM-DD] [--gstin X] | issue --verify KEY');
