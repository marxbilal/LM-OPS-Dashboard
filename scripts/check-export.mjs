// Run the cleaning pipeline on an export and print the headline numbers (no browser needed).
//   node scripts/check-export.mjs LM-ops-data.xlsx
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { buildDataset, dayToISO } from '../src/data/pipeline.js';

const wb = XLSX.read(fs.readFileSync(process.argv[2]), { type: 'buffer', dense: true, cellDates: false, cellNF: false, cellText: false, raw: true });
const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: false });
const ds = buildDataset({ header: aoa[0], rows: aoa.slice(1) });
const v = ds.validation;
if (!v.accepted) { console.error(v.errors.join('\n')); process.exit(1); }
const stock = ds.V.filter((x) => x.inStock);
console.log(`As of ${dayToISO(ds.meta.asOf)} | cards ${ds.V.length} | shipments ${ds.S.length} | POs ${ds.P.length}`);
console.log(`In stock ${stock.length} | in transit ${ds.V.filter((x) => x.inTransit).length} | avg days ${(stock.reduce((a, x) => a + x.days, 0) / stock.length).toFixed(1)}`);
console.log('Stages', v.stages);
console.log('Warnings', v.warnings);
v.log.forEach(([s, t]) => console.log(`- ${s}: ${t}`));
