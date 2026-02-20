# KKME.eu — Signal Console

Baltic energy market signal dashboard. Dark, minimal, action-biased.

## Quick Start

```bash
npm install
npm run lint      # ESLint check
npm run fetch     # Fetch ENTSO-E prices (needs ENTSOE_API_TOKEN)
npm run deploy    # Deploy to Cloudflare Pages
```

## Structure

```
assets/fonts/     — Web fonts (Syne, Syne Mono, DM Mono)
assets/icons/     — SVG icons
data/             — Fetched market data (gitignored)
scripts/          — Data fetch scripts
.github/workflows — CI/CD (Lighthouse + deploy)
```
