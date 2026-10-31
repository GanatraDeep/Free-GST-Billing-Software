# Divtech Hisaab: setup guide (for Divtech)

## 1. One time, on your own computer

Install **Node.js 20 LTS** (https://nodejs.org) and **Git**
(https://git-scm.com). Then in a terminal:

```bash
git clone https://github.com/GanatraDeep/free-gst-billing-software.git
cd free-gst-billing-software
npm install
npm run license:init
```

`license:init` creates your signing key:

- **Private key**: `~/.divtech-hisaab/license-private.pem`
  (Windows: `C:\Users\<you>\.divtech-hisaab\`). Keep it secret and back it
  up (pen drive or password manager). Lose it and you cannot issue keys that
  existing shops accept. Never commit it.
- **Public key**: written into `license.js`. Commit and push it:

```bash
git add license.js
git commit -m "Set Divtech license public key"
git push
```

## 2. Publish a release (the setup file)

```bash
git tag v1.11.0
git push origin v1.11.0
```

GitHub Actions (the **Actions** tab on GitHub) builds the setup and publishes
it under **Releases** in about 5 to 10 minutes. Download
**`Divtech-Hisaab.zip`** from there.

For each later update: change `version` in `package.json` and
`docs-site/site.mjs`, add an entry at the top of `CHANGELOG.md`, commit, push,
then tag and push `v<new version>`. Shops with an active subscription see the
update in the app.

## 3. Install at the shop PC (Windows 10 / 11)

1. Copy `Divtech-Hisaab.zip` to the shop PC (pen drive, WhatsApp Web, email).
2. Right-click the ZIP → **Extract All…** and extract to a permanent place,
   for example `C:\Divtech Hisaab` or `D:\Divtech Hisaab`. **Not** Downloads
   or the Desktop: the app runs from wherever it is extracted.
3. Open the extracted `Divtech-Hisaab` folder and double-click
   **Divtech Hisaab - WINDOWS**.
4. If Windows says **"Windows protected your PC"**: click **More info**, then
   **Run anyway** (the app is not code-signed; this is expected).
5. Click **Install**. A black window works for 1 to 3 minutes; leave it.
   The PC needs internet the first time if Node.js is not installed yet.
6. The app opens. A **Divtech Hisaab** icon is now on the Desktop and in the
   Start menu; use that every day.
7. Fill in the business details in the welcome screens (name, GSTIN, address,
   state, bank / UPI).

## 4. Activate the subscription

On your computer:

```bash
npm run license:issue -- --shop "Ganatra Oil Traders" --months 12 --gstin 24XXXXXXXXXXXXX
```

Send the printed key (starts with `DH1-`). At the shop: **Support &
Subscription** (bottom of the sidebar) → paste the key → **Save license key**.
Every key you issue is logged in `~/.divtech-hisaab/issued-keys.csv`.

To renew, issue a new key with a later date (`--until 2028-10-31`) and enter
it the same way.

## 5. Good practice at the shop

- **Settings → Backup**: add a second backup folder on another drive or a pen
  drive. Daily backups are automatic; the second copy protects against a
  failed disk.
- **Settings → App lock**: set a PIN if staff share the PC.
- The app is at `http://localhost:47371` in the browser if the icon is ever
  missing.

## Moving from Miracle Accounting

There is no direct Miracle import. Export from Miracle to Excel, save as CSV:

1. **Parties (ledgers)** → **Clients → Import CSV** (Name, GSTIN, Phone,
   Email, Address, State).
2. **Items** (oils: name, HSN 1507–1515, GST 5%, unit such as KG / LTR / TIN)
   → **Products → Import CSV**, with opening stock.
3. **Party closing balances** (Sundry Debtors and Sundry Creditors, as on the
   day before you start) → **Clients → Opening balances → Import CSV**.
   Only Name and Amount are needed; a Dr/Cr column, or "12,500.00 Dr" in the
   amount, decides who owes whom. Download the sample file in that window to
   see the layout. Check the total at the bottom against Miracle.

Start fresh invoices in Divtech Hisaab from that day and keep Miracle for
older records. Payments against old balances: **Receipts → Quick Select —
Opening Balances** (prints a receipt), or **Received** / **Paid** in the
Opening balances window.
