// Build public/data/snapshot.json.gz from a NetSuite export so a static deploy opens with data.
//   node scripts/make-snapshot.mjs LM-ops-data.xlsx
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as XLSX from 'xlsx';
import { buildDataset } from '../src/data/pipeline.js';
import { packDataset } from '../src/data/pack.js';

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/make-snapshot.mjs <export.xlsx>'); process.exit(1); }
const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer', dense: true, cellDates: false, cellNF: false, cellText: false, raw: true });
const sheetName = wb.SheetNames[0];
const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: false });
const ds = buildDataset({ header: aoa[0], rows: aoa.slice(1) }, { meta: { fileName: file.split(/[\\/]/).pop(), sheetName, source: 'file' } });
if (!ds.validation.accepted) { console.error(ds.validation.errors.join('\n')); process.exit(1); }
fs.mkdirSync('public/data', { recursive: true });
const gz = zlib.gzipSync(JSON.stringify(packDataset(ds)), { level: 9 });
fs.writeFileSync('public/data/snapshot.json.gz', gz);
console.log(`public/data/snapshot.json.gz written (${(gz.length / 1e6).toFixed(2)} MB, ${ds.V.length} vehicle cards, as of ${new Date(ds.meta.asOf * 86400000).toISOString().slice(0, 10)})`);
