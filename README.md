# Divtech Hisaab

GST billing, stock, accounts and returns for Indian businesses, by
[Divtech](https://divtech.in). It runs on the shop's own computer, opens in
the browser, and works without the internet. Data never leaves the computer.

**Contact:** WhatsApp / call +91 94299 11067 · hello@divtech.in · https://divtech.in

**Current version:** 1.16.0 · [Changelog](CHANGELOG.md) · [Releases](../../releases)

---

## What it does

### Billing
- Tax invoices, bills of supply, composition bills, proformas, quotations,
  credit notes and delivery challans, with CGST / SGST / IGST worked out
  automatically, invoice series, round off, discounts and TDS / TCS
- **Sale types** (Cash, Retail Debit, Debit or your own): a cash sale is paid
  in cash on the spot and goes to the Cash book
- A4, A5 and thermal printing in several styles; **Copies** box (1 to 4) next
  to Print for Original / Duplicate / Triplicate / Extra copy; 6 mm
  printer-safe margins so nothing is cut off
- PDF, WhatsApp and email sharing, UPI QR on the invoice, e-way bill and
  e-invoice (IRN) JSON
- **Cancel an invoice**: it leaves sales, GST and stock, and the money taken
  on it leaves cash, the bank and the customer's account; Undo cancel brings
  it all back
- **Dashboard totals**: the invoice list shows the amount, taxable value, GST,
  received and due of whatever the filters show, not only the count

### Buying, stock and freight
- Purchase bills with **bill types** (Cash, Debit, URD), purchase returns
  (debit notes), kasar / discount received, and payment from cash, bank or a
  CC account
- Products with stock that moves with every sale, purchase and return;
  **stock adjustments** for counting differences, leakage and wastage;
  negative stock shown as a negative number
- **Freight (jakat) under reverse charge**: one freight account per goods,
  the RCM in GSTR-3B and a monthly RCM register for the GST filer
- **Expenses under reverse charge**, such as rent from an unregistered
  landlord: GST worked out on top and paid with GSTR-3B, not to the vendor

### Money and accounts
- Receipts, Cash book, Bank book, and bank / CC / loan accounts
- **Rojmel (day book)**: jama and udhar day by day with each day's opening
  and closing, for cash, a bank, or all of them; and a **day-wise summary**
  of sales, purchases, expenses, cash and bank
- Full **double-entry accounts** worked out from everything you enter:
  ledgers for every customer, supplier and account, payment / receipt /
  contra / journal vouchers, trial balance, trading account, profit and
  loss, balance sheet, for a year or any dates, in book (T-form) or modern
  layout
- **Closing stock method**: weighted average, FIFO, last purchase rate or
  fixed rate, as in Tally
- **Year end**: close the year, carry balances forward, and a **CA pack**
  (Excel with every ledger, register and the final accounts)
- Customer and supplier opening balances, outstanding and reminders

### GST
- GSTR-1 and GSTR-3B: on screen, portal JSON, CSV, and Excel (one sheet per
  table), or the whole month in one Excel file
- GSTR-3B Excel includes the purchase register, expenses with GST, the RCM
  freight register and **HSN-wise inward and outward summaries**
- GSTR-2B matching, ITC set-off, **Record GST paid** (the payment entry,
  including the RCM)

### Bulk import (CSV)
- Clients, suppliers, products, opening balances, purchase bills (with Bill
  Type and Round Off) and sales invoices (with Sale Type)
- The sales import takes sold quantities out of stock; invoices imported
  earlier without that can be fixed with **Take it out of stock now**

### Everyday
- Daily automatic backups, Google Drive backup, PIN lock, several businesses
  in one app, help pages built into the app

---

## What's new

| Version | Highlights |
|---|---|
| **1.16.1** | Purchase bill OCR reads the right fields: supplier by GSTIN (scan mistakes put right, your own GSTIN skipped), invoice no., only real item rows (qty × rate = amount), charges, GST rate and round off, with checks that the bill adds up |
| 1.16.0 | Closing stock methods (average, FIFO, last purchase rate, fixed); final accounts for any dates; book (T-form) and modern views; Trading account; CA-ready layout |
| 1.15.1 | Cash book matches the final accounts; profit fixed (opening stock without purchase price, Reports = Final accounts); expenses under reverse charge (RCM rent) |
| 1.15.0 | Rojmel (day book) and day-wise summary; amount totals on the filtered Dashboard list; this README |
| 1.14.3 | Sales CSV import takes stock out (and a repair for earlier imports); HSN-wise inward / outward in the GSTR-3B Excel |
| 1.14.2 | Sale Type column in the sales CSV import |
| 1.14.1 | Bill Type and Round Off in the purchase CSV import; negative stock shown as negative; a cancelled cash invoice takes the cash back out; whole-rupee purchase round off |
| 1.14.0 | Freight (jakat) under RCM; bank / CC account on payments; purchase returns; stock adjustments; kasar; Record GST paid; printing fixes (copies, margins) |
| 1.13.0 | Double-entry accounts, vouchers, trial balance, P&L, balance sheet, year end, CA pack; whole-month GST Excel |
| 1.12.0 | Divtech Hisaab branding, subscription keys and in-app updates |

The full list, with how to update, is in [CHANGELOG.md](CHANGELOG.md).

---

## Installing at a shop

Download **Divtech-Hisaab-Setup.exe** from the [Releases](../../releases)
page and run it. It installs, keeps data in the shop's own folder, and
updates itself from **Settings → App Updates**. See
[DIVTECH_SETUP.md](DIVTECH_SETUP.md) for the full guide.

## Subscription

The app always works, with all its features and data. A subscription only
brings **updates**: a license key covers every release published on or before
its end date. Keys are signed by Divtech and checked on the shop's computer,
never online.

Key management (Divtech only):

```bash
npm run license:init                       # once: creates the signing key
npm run license:issue -- --shop "Shop Name" --months 12
npm run license:issue -- --verify "DH1-..."
```

The private signing key is saved in `~/.divtech-hisaab/license-private.pem`
and must never be committed. Back it up.

## Development

Needs Node.js 20 or newer.

```bash
npm install
npm run dev          # app with live reload
npm test             # unit tests (accounts, GST, CSV, stock...)
npm run build        # app + help pages into dist/
npm run release:zip  # the setup ZIP in release-build/
```

Browser tests: `SMOKE_BROWSER=chromium node tests/smoke.mjs` (run it on its
own; it starts its own server).

## Releasing an update

1. Change the version in `package.json`, `package-lock.json`,
   `docs-site/site.mjs` and `DIVTECH_SETUP.md`, and add the new entry at the
   top of `CHANGELOG.md`.
2. Merge into `main`, then tag the merge commit and push the tag:
   `git checkout main && git pull && git tag v1.15.0 && git push origin v1.15.0`.
3. GitHub Actions builds the setup and publishes the release in about 15
   minutes. Installed copies with an active subscription see the update
   within six hours, or at once with **Settings → App Updates → Check for
   Updates**.
