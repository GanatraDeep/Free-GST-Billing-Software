# Divtech Hisaab

GST billing, stock, accounts and returns for Indian businesses, by
[Divtech](https://divtech.in). It runs on the shop's own computer, opens in
the browser, and works without the internet. Data never leaves the computer.

- Tax invoices, bills of supply, proformas, quotations, credit notes and
  delivery challans, with CGST / SGST / IGST worked out automatically
- Clients, products and stock, purchases, expenses, receipts and cash book
- Reports, GSTR-1 / GSTR-3B JSON, GSTR-2B matching, e-way bill and TDS / TCS
- Daily automatic backups, PIN lock, thermal and A4 printing, WhatsApp sharing

**Contact:** WhatsApp / call +91 94299 11067 · hello@divtech.in · https://divtech.in

---

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
npm test             # unit tests
npm run build        # app + help pages into dist/
npm run release:zip  # the setup ZIP in release-build/
```

## Releasing an update

1. Change `version` in `package.json` and `docs-site/site.mjs`, and add the
   new entry at the top of `CHANGELOG.md`.
2. Commit, then tag and push: `git tag v1.11.1 && git push origin main --tags`.
3. GitHub Actions builds the setup ZIP and publishes the release. Installed
   copies with an active subscription see the update within six hours, or at
   once with **Settings → App Updates → Check for Updates**.

See `DIVTECH_SETUP.md` for installing at a shop.
