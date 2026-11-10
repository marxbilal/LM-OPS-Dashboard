// Reads an uploaded export (or rows from the NetSuite sync), cleans it and returns the packed dataset.
import * as XLSX from 'xlsx';
import { buildDataset, mapColumns } from './pipeline.js';
import { packDataset } from './pack.js';
import { writeXlsx, objectsToRows } from './xlsxWriter.js';
import { parseLandedSheet } from './landed.js';

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

export function processFile(buffer, fileName, now, progress = () => {}, extras = {}) {
  progress('Reading the file', 0.08);
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', dense: true, cellDates: false, cellNF: false, cellText: false, cellStyles: false, raw: true });
  const sheetName = pickSheet(wb);
  progress('Reading rows', 0.45);
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: false });
  progress('Cleaning and validating', 0.6);
  const ds = buildDataset({ header: aoa[0] || [], rows: aoa.slice(1), lcSheet: extras?.lcSheet }, { now, meta: { fileName, sheetName, source: 'file' } });
  if (!ds.validation.accepted) return { ok: false, validation: ds.validation };
  progress('Packing', 0.85);
  return { ok: true, packed: packDataset(ds) };
}

export function processRows(header, rows, now, label, progress = () => {}, extras = {}) {
  progress('Cleaning and validating', 0.6);
  const ds = buildDataset({ header, rows, landed: extras?.landed, bills: extras?.bills, lcSheet: extras?.lcSheet }, { now, meta: { fileName: label, sheetName: 'NetSuite', source: 'netsuite' } });
  if (!ds.validation.accepted) return { ok: false, validation: ds.validation };
  progress('Packing', 0.85);
  return { ok: true, packed: packDataset(ds) };
}

/** The landed cost sheet (.xlsx/.csv) -> per-card landed cost by type, see parseLandedSheet. */
export function processLcSheet(buffer, fileName, progress = () => {}) {
  progress('Reading the landed cost sheet', 0.2);
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', dense: true, cellDates: false, cellNF: false, cellText: false, raw: true });
  const name = wb.SheetNames.find((n) => {
    const ws = wb.Sheets[n];
    if (!ws?.['!ref']) return false;
    const range = XLSX.utils.decode_range(ws['!ref']); range.e.r = range.s.r;
    const head = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, range })[0] || [];
    return head.some((h) => /^vehicle card/i.test(String(h ?? '').trim()));
  }) ?? wb.SheetNames[0];
  progress('Matching landed cost lines', 0.6);
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
  return { sheet: parseLandedSheet(aoa, fileName) };
}

/** The offline copy of a NetSuite pull: the merged vehicle rows plus the vendor bills and IBV landed-cost lines, as .xlsx bytes. */
export async function buildOfflineXlsx(header, rows, extras = {}, progress = () => {}) {
  return writeXlsx([
    { name: 'Vehicles', rows: [header, ...rows] },
    { name: 'Vendor bills', rows: objectsToRows(extras?.bills || []) },
    { name: 'IBV landed cost', rows: objectsToRows(extras?.landed || []) },
  ], (name) => progress(`Writing the offline copy - ${name}`, 0.5));
}

const inWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
if (inWorker) self.onmessage = (e) => {
  const m = e.data;
  if (m.kind === 'xlsx') {
    buildOfflineXlsx(m.header, m.rows, m.extras, say)
      .then((bytes) => self.postMessage({ type: 'done', bytes }, [bytes.buffer]))
      .catch((err) => self.postMessage({ type: 'error', message: err?.message || String(err) }));
    return;
  }
  try {
    const out = m.kind === 'lcsheet' ? processLcSheet(m.buffer, m.fileName, say)
      : m.kind === 'file'
      ? processFile(m.buffer, m.fileName, m.now, say, m.extras)
      : processRows(m.header, m.rows, m.now, m.label, say, m.extras);
    self.postMessage({ type: 'done', ...out });
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || String(err) });
  }
};
