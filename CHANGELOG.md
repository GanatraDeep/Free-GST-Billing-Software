# Changelog

All notable changes to **Divtech Hisaab** are listed here, newest first.

---

## [1.14.0] - 2026-11-01

### How to update

**Current version:** 1.13.0  →  **New version:** 1.14.0

1. Open the app and click **Update to v1.14.0** in the menu, or
   **Settings → App Updates → Update Now** (needs an active subscription).
2. The app closes, updates and opens again by itself.

If the button does not work, download **Divtech-Hisaab-Setup.exe** from the
Releases page and run it; it installs over your copy and keeps your data.

### Added
- **Which bank / CC account**: add other bank accounts and CC / OD accounts in
  Accounts, then pick **Received in** / **Paid from** on receipts, Record
  payment, supplier payments and expenses paid by bank, UPI, cheque or card.
  The money goes straight to that account's ledger (CC used / available
  follows it).
- **Purchase returns (debit notes)**: goods sent back to a supplier, from
  scratch or from a bill. Stock comes out, the supplier's balance and the
  input tax credit (GSTR-3B, GST ledgers) go down, refunds can be recorded.
- **Stock adjustments**: shortage, leakage, wastage or excess found on
  counting, dated with a reason, from the new button on each product. Valued
  at average cost: a shortage is an expense (Stock shortage and wastage) in
  the final accounts and in Reports' profit and loss. Changing stock in a
  product asks to record the difference as an adjustment.
- **Kasar / discount**: write off a small balance when recording a customer
  payment or receipt (Discount allowed), or a supplier payment (Discount
  received). The invoice or bill is settled.
- **Record GST paid** on GSTR-3B: one voucher for the period's GST, with
  credit used across heads, tax paid in cash, interest and late fee, from the
  bank, cash or CC.

### Fixed
- The automatic browser tests no longer fail when they run just after
  midnight in India (they used UTC dates). The daily subscription reminder
  also follows the local day now.

---

## [1.13.0] - 2026-11-01

### How to update

**Current version:** 1.12.0  →  **New version:** 1.13.0

1. Open the app and click **Update to v1.13.0** in the menu, or
   **Settings → App Updates → Update Now** (needs an active subscription).
2. The app closes, updates and opens again by itself.

If the button does not work, download **Divtech-Hisaab-Setup.exe** from the
Releases page and run it; it installs over your copy and keeps your data.

### Added
- **Double-entry accounts.** Every invoice, receipt, purchase, payment,
  expense, cash / bank entry and opening balance is now posted to accounts by
  itself (debit = credit), so the books always agree.
- **Accounts**: capital, loans taken (secured and unsecured), the bank
  **CC / OD account** with its sanctioned limit (used and available shown),
  fixed assets with a depreciation rate, investments, loans and deposits
  given, other assets, liabilities, incomes and expenses, each with an opening
  balance.
- **Vouchers**: Payment, Receipt, Contra and Journal, numbered by type and
  year (PV/26-27/0001...): loan received and repaid, interest on CC and loans,
  capital brought in, drawings, cash into the CC, GST paid, depreciation.
- **Final accounts**: trial balance, trading and profit & loss account and
  balance sheet for any financial year; a **year-end checklist**; **close the
  year** (entries dated in a closed year ask before they change); and the
  **CA pack**: one Excel file with the statements, day book, cash and bank
  books, every ledger, debtors, creditors, stock and all registers.
- Depreciation worked out on the written-down value (half rate on additions
  used under 180 days) and saved as a journal voucher.
- Ledgers list every account, including CC, loans, assets and expense heads.
- **GST Returns → Whole period (Excel)**: GSTR-1 and GSTR-3B of the month (or
  quarter / year) in one Excel file, one sheet per table, with a sales
  register, purchase register and expenses with GST. **Excel (all tables)** on
  each tab gives one return on its own.

### Changed
- GST on purchases from an unregistered dealer (URD) is counted in the cost of
  purchases, as it cannot be claimed.

---

## [1.12.0] - 2026-10-31

### How to update

**Current version:** 1.11.3  →  **New version:** 1.12.0

1. Open the app and click **Update to v1.12.0** in the menu, or
   **Settings → App Updates → Update Now** (needs an active subscription).
2. The app closes, updates and opens again by itself.

If the button does not work, download **Divtech-Hisaab-Setup.exe** from the
Releases page and run it; it installs over your copy and keeps your data.

### Added
- **Suppliers** (purchase master) in the sidebar: supplier list with GSTIN,
  registration, contact details, what you bought, paid and still owe, CSV
  import and opening balances. Purchase bills fill the supplier's details from
  it, and new suppliers join it by themselves.
- **Sale types** on invoices: **Cash** (saved as paid, the cash goes into the
  Cash book at once), **Retail Debit** and **Debit** (due until a receipt is
  recorded). A debit invoice cannot be marked paid without recording the
  payment. Rename or add types in Settings → Company.
- **Purchase types** on purchase bills: **Cash** (paid in cash at once),
  **Debit** (payable until a payment is recorded) and **URD** (unregistered
  dealer: no input tax credit in GSTR-3B). Add more in Settings → Company.
- **Bank book**: money in and out of the bank (bank transfer, UPI, cheque,
  card), with the bank balance. Cash deposited in the bank (Cash book,
  "Deposit to bank") and cash withdrawn (Bank book, "Cash withdrawal") show in
  both books.
- **Ledgers**: any ledger on one screen, with debit, credit and running
  balance: each customer and supplier, each item (stock in and out, value
  without GST, average cost), GST (CGST, SGST, IGST, cess), cash, bank, sales,
  purchases and expenses. **Ledger** buttons on clients, suppliers and products.
- Units **Tin**, **Drum**, **Carton** and **Quintal**, and **+ New unit** in
  the product form.

### Fixed
- **Profit & Loss** now subtracts the **cost of goods sold** (items sold at
  their average purchase rate, without GST) and shows **Gross profit**. Before,
  purchases were left out and a bought-and-sold item showed a 100% margin.

---

## [1.11.3] - 2026-10-31

### How to update

**Current version:** 1.11.2  →  **New version:** 1.11.3

1. Open the app and click **Update to v1.11.3** in the menu, or
   **Settings → App Updates → Update Now** (needs an active subscription).
2. The app closes, updates and opens again by itself.

If the button does not work, download **Divtech-Hisaab-Setup.exe** from the
Releases page and run it; it installs over your copy and keeps your data.
(ZIP users: extract `Divtech-Hisaab.zip` over your folder instead.)

### Changed
- **Divtech-Hisaab-Setup.exe** no longer carries any script files (PowerShell
  or shell), which antivirus programs and browsers flagged as suspicious.
- Control Panel → **Backup** works in a Setup install: it copies your data to
  Documents\Divtech Hisaab Backups.

---

## [1.11.2] - 2026-10-31

### How to update

**Current version:** 1.11.1  →  **New version:** 1.11.2

1. Open the app and click **Update to v1.11.2** in the menu, or
   **Settings → App Updates → Update Now** (needs an active subscription).
2. Wait about a minute, then reload the page.

New installs on Windows: use **Divtech-Hisaab-Setup.exe** instead of
`Divtech-Hisaab.zip`. If the button does not work, ask Divtech for
`Divtech-Hisaab.zip`, close the app, extract the ZIP over your Divtech Hisaab
folder (replace files when asked) and double-click **Divtech Hisaab - WINDOWS**.

### Added
- **Divtech-Hisaab-Setup.exe**: a normal Windows installer. Choose any folder
  or drive, no administrator rights, Node.js included (nothing is downloaded).
  The Desktop and Start-menu icons open **Divtech Hisaab.exe**, which starts
  the app directly. Installing, opening and updating no longer run PowerShell
  scripts, which antivirus programs such as Bitdefender blocked.
- Updates of a Setup install download the new Setup and run it; the app
  closes and opens again by itself. Remove it from Windows Settings → Apps;
  your data folder is kept.

---

## [1.11.1] - 2026-10-31

### How to update

**Current version:** 1.11.0  →  **New version:** 1.11.1

1. Open the app and click **Update to v1.11.1** in the menu, or
   **Settings → App Updates → Update Now** (needs an active subscription).
2. Wait about a minute, then reload the page.

If the button does not work, ask Divtech for `Divtech-Hisaab.zip`, close the
app, extract the ZIP over your Divtech Hisaab folder (replace files when
asked) and double-click **Divtech Hisaab - WINDOWS**. Your data is kept.

### Added
- **Invoice series**: your own numbering series for tax invoices, such as
  **A** retail cash, **AB** retail credit and **BB** dealer credit. Add, edit,
  archive and choose the default in **Settings → Company → Invoice series**:
  prefix, separator (/, - or none), year in the number or not, digits, and
  the next number (to continue from your old software). Each series counts on
  its own and can start again at 1 every April.
- On a tax invoice, **Series** buttons pick the series; the number follows.
  Each client remembers the series of their last invoice.
- The Dashboard's **All Types** filter can show one series, and GSTR-1's
  documents-issued table (Table 13) lists each series on its own row.

---

## [1.11.0] - 2026-10-31

The first release of **Divtech Hisaab** by Divtech.

### How to update

**Current version:** 1.10.83  →  **New version:** 1.11.0

1. Open the app and click **Update to v1.11.0** in the menu, or
   **Settings → App Updates → Update Now**. Updates need an active
   subscription (Support & Subscription).
2. Wait about a minute, then reload the page.

If the button does not work, ask Divtech for `Divtech-Hisaab.zip`, close the
app, extract the ZIP over your Divtech Hisaab folder (replace files when
asked) and double-click **Divtech Hisaab - WINDOWS**. Your data is kept.

### Added
- **Support & Subscription** page: your plan, its end date, and where to enter
  or renew your license key. Renew on WhatsApp in one click.
- A short subscription reminder, at most once a day, when there is no key or
  the plan ends within 15 days.
- The help pages now come with the app and open without the internet.
- **Opening balances** for clients and suppliers, for moving from Miracle or
  other software: what each party owed (or had paid in advance) on the day you
  start. They count in every outstanding figure (client cards, Statement and
  Aging PDFs, Outstanding & Aging, Party Outstanding, the Dashboard), can be
  paid off from the Opening balances window or with a receipt, and import from
  a CSV of closing balances (Dr / Cr understood). Open it from **Clients** or
  **Purchases → Opening balances**.

### Changed
- New name and look: **Divtech Hisaab** by Divtech.
- **Report a problem** now opens WhatsApp to Divtech with the details filled in
  (private details removed).
- Updates come from Divtech and need an active subscription. The app itself
  always keeps working, with all your data, with or without one.

---
