# Legend Motors - Supply Chain & Operations dashboard

React + Vite app with five pages - **Purchase Orders, Inbound, Inventory & Aging, Outbound, Costs** - plus a
key-locked **Upload Data** page modelled on the Sales dashboard (NetSuite Data Sync, raw CSV download, file drop,
validation report). A chassis / VST search in the top bar opens any car's full history.

## Run it locally

```bash
npm install
npm run dev          # http://localhost:5173
```
Open **Upload Data**, enter the key `17278`, and drop the NetSuite vehicle export (`.xlsx`, `.xlsm` or `.csv`).

## Deploy to Netlify

### Option A - full version (shared data for everyone + NetSuite sync) - recommended
Functions only deploy from Git or the Netlify CLI (not from drag and drop).

```bash
npm install
npx netlify-cli login
npx netlify-cli link            # or: npx netlify-cli init  (to create a new site)
npx netlify-cli env:set UPLOAD_KEY 12345
npx netlify-cli deploy --build --prod
```
Git alternative: push this folder to GitHub, then in Netlify: **Add new site > Import an existing project** >
pick the repo > Build command `npm run build` > Publish directory `dist` > **Deploy**.

With functions deployed, an upload is stored in Netlify Blobs and every viewer sees it ("Saved to: Shared").

### Option B - quick static version (drag and drop)
`npm run build`, then Netlify: **Sites > your site > Deploys** > drag the `dist` folder onto the page.
Dashboards work, but each browser keeps its own upload (no shared store, no NetSuite sync).
To ship the same data to everyone on a static deploy, run `node scripts/make-snapshot.mjs LM-ops-data.xlsx`
before `npm run build` - the site then opens with that snapshot until someone uploads a newer file.

### Who can see the data
Everyone has to sign in first (Legend email + password, checked on the server; see `DASHBOARD_USERS` below). To add a user, run
`node -e "import('./netlify/lib/auth.mjs').then(a => console.log('email@legendmotorsuae.com:' + a.hashPassword('their-password')))"`
and append the output (comma-separated) to `DASHBOARD_USERS` in `.env` and on Netlify.

The dashboards are open to anyone with the site URL (only Upload Data is locked), and so is the dataset behind them.
If the URL may leave the team, turn on Netlify password protection or SSO for the site.

## NetSuite Data Sync

The sync reads NetSuite directly over **SuiteQL** (REST API) with Token-Based Authentication, the same way the Business
Sales Dashboard does - nothing is deployed inside NetSuite. Each record type is pulled as its own table (vehicle cards,
VSTs, vehicle outbound, IBV + inbound shipment, IBV items, purchase orders, names) and joined by internal ID in the
browser into the export's columns; the queries and the join live in `src/data/netsuite.js`. A full sync is ~110 pages,
5 at a time - about a minute or two.

1. **Keys** - set these five (Setup > Integration > Manage Integrations for the consumer key/secret, Setup > Users/Roles >
   Access Tokens for the token):

 

   - **Locally:** they live in `.env` in the project root (git-ignored). `npm run dev` serves `/api/netsuite-sync` from
     them, so **NetSuite Data Sync** works on `localhost` without the Netlify CLI.
   - **Netlify:** Site configuration > Environment variables (or `npx netlify-cli env:import .env`), then redeploy.
     Secrets stay on the server; the browser never sees them.
2. The token's role needs **REST Web Services** and **SuiteAnalytics Workbook** permissions plus view access to the
   vehicle custom records, purchase orders and inbound shipments. Keep the token user's date format `DD/MM/YYYY`.
3. **PO Location** is not pulled (it sits on the PO line and that join is too slow); the validation report lists it as a
   missing optional column.

## Data rules (agreed)

| Topic | Rule |
|---|---|
| Unique key | Internal ID = vehicle card. A car moved between LMF / LMM / AMF or returned gets a new card; only the current card counts. |
| Sold | Vehicle Status `Sold` = moved out, whatever the Shipment Status. |
| Age | Days since the card's **IBV date** (when the car became Available); purchase date where there is no IBV. |
| In transit | Shipment Status `Locked-In Transit`. |
| Waiting to leave | `VSO Fulfilled` = paid, awaiting delivery. `VSO Reserved` = not fully paid. |
| Landed cost | Shown exactly as posted. Missing landed cost is flagged, never estimated. |
| Excluded | After-sales cards, capitalized cars, non-vehicle items (chargers, forklifts, spare parts). |
| Amounts | Purchase Price, Landed Cost, Total Cost are already AED. Total = Purchase + Landed (checked on every upload). |

Mappings you may want to edit (locations, ports, destinations) live in `src/data/lookups.js`.

## Change the upload key
1. Server: set `UPLOAD_KEY` in Netlify to the new key.
2. Page lock: replace `KEY_HASH` in `src/pages/Upload.jsx` with the output of
   `node -e "console.log(require('crypto').createHash('sha256').update('NEWKEY').digest('hex'))"`, then redeploy.

The page lock is a convenience gate. Writes to the shared store and NetSuite sync calls check the key again on the server.

## Notes
- SheetJS: npm only has `xlsx@0.18.5`. When you build on your machine, upgrade with
  `npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.
- `npm run build:single` produces one self-contained `dist-single/index.html` (used for the hosted preview).
- `node scripts/check-export.mjs <file>` runs the cleaning pipeline without a browser and prints the headline numbers.
