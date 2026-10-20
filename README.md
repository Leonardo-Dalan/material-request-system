# Material Request System

Factory material request system: operators request materials, logistics fulfills them through a priority queue, and management tracks everything with stock control, dashboards and reports. Offline-first web app built with vanilla JS and Firebase.

## Features

- **Role-based access** — Requester, Logistics and Admin roles with demo accounts
- **Catalog** — searchable material catalog (part number or name, accent-insensitive), subcategories, photo support, admin CRUD, CSV import with preview and duplicate detection
- **Request flow** — one material per request, urgency flag, job number, drop-off location, area, reorder shortcuts
- **Logistics queue** — urgent-first ordering, NEW → WORKING → DONE / REJECTED transitions, standardized rejection reasons with optional notes, actor and timestamp tracking
- **Stock control** — receipts and issues ledger, per-item balances calculated chronologically
- **Dashboard** — today's requests, fulfillment and rejection counts, urgent open, average fulfillment time, 14-day chart, top items, rejection Pareto
- **Reports** — day/week/month periods, requested/fulfilled/rejected counts, top materials, rejection Pareto
- **Export** — single "Export all data" action producing one `.xlsx` with Catalog, Requests and Stock Movements sheets (SheetJS bundled locally, no CDN)
- **Sync** — Firebase Realtime Database sync (URL stored per-device in localStorage), non-destructive merge

## Demo

Try it with the demo accounts:

| Role      | Username    | Password      |
|-----------|-------------|---------------|
| Requester | `requester` | `requester123`|
| Logistics | `logistics` | `logistics123`|
| Admin     | `admin`     | `admin123`    |

## Run locally

```bash
npm run serve
```

Then open http://localhost:8000

To enable cloud sync, paste your Firebase Realtime Database URL into the app when prompted. The URL is stored only in your browser's localStorage, never in the source code.

## Tech stack

- Vanilla HTML / CSS / JavaScript (no framework, no build step)
- Firebase Realtime Database (optional sync)
- SheetJS (vendored locally for `.xlsx` export)
- Node.js (dev server and test harness only)

## Project structure

```
index.html          # app entry point
js/                 # application modules (auth, catalog, requests, queue, stock, dashboard, reports, sync)
tests/              # smoke test suite
scripts/            # dev server
```

## License

MIT
