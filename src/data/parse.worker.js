// Reads an uploaded export (or rows from the NetSuite sync), cleans it and returns the packed dataset.
import * as XLSX from 'xlsx';
import { buildDataset, mapColumns } from './pipeline.js';
import { packDataset } from './pack.js';

const say = (stage, pct) => self.postMessage({ type: 'progress', stage, pct });

function pickSheet(wb) {
  // the first sheet whose header row maps "Internal ID" and "Chassis Number"
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    range.e.r = range.s.r;
    const head = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, range })[0] || [];
    const { idx } = mapColumns(head);
    if (idx['Internal ID'] !== undefined && idx['Chassis Number'] !== undefined) return name;
  }
  return wb.SheetNames[0];
}

export function processFile(buffer, fileName, now, progress = () => {}) {
  progress('Reading the file', 0.08);
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', dense: true, cellDates: false, cellNF: false, cellText: false, cellStyles: false, raw: true });
  const sheetName = pickSheet(wb);
  progress('Reading rows', 0.45);
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: false });
  progress('Cleaning and validating', 0.6);
  const ds = buildDataset({ header: aoa[0] || [], rows: aoa.slice(1) }, { now, meta: { fileName, sheetName, source: 'file' } });
  if (!ds.validation.accepted) return { ok: false, validation: ds.validation };
  progress('Packing', 0.85);
  return { ok: true, packed: packDataset(ds) };
}

export function processRows(header, rows, now, label, progress = () => {}, extras = {}) {
  progress('Cleaning and validating', 0.6);
  const ds = buildDataset({ header, rows, landed: extras?.landed, bills: extras?.bills }, { now, meta: { fileName: label, sheetName: 'NetSuite', source: 'netsuite' } });
  if (!ds.validation.accepted) return { ok: false, validation: ds.validation };
  progress('Packing', 0.85);
  return { ok: true, packed: packDataset(ds) };
}

const inWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
if (inWorker) self.onmessage = (e) => {
  const m = e.data;
  try {
    const out = m.kind === 'file'
      ? processFile(m.buffer, m.fileName, m.now, say)
      : processRows(m.header, m.rows, m.now, m.label, say, m.extras);
    self.postMessage({ type: 'done', ...out });
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || String(err) });
  }
};
