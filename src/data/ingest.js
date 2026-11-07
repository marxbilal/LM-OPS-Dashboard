// Main-thread entry points for loading new data: a dropped file or the NetSuite sync.
import ParseWorker from './parse.worker.js?worker&inline';
import { TABLES, mergeTables } from './netsuite.js';
import { authFetch } from './auth.js';

function runInWorker(message, onProgress) {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new ParseWorker(); } catch (e) { reject(e); return; }
    w.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'progress') onProgress?.(d.stage, d.pct);
      else if (d.type === 'done') { w.terminate(); resolve(d); }
      else if (d.type === 'error') { w.terminate(); reject(new Error(d.message)); }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'The file could not be processed.')); };
    w.postMessage(message, message.buffer ? [message.buffer] : []);
  });
}

async function runHere(message, onProgress) {
  // Fallback when workers are blocked: same code on the main thread (the page pauses while it runs).
  const mod = await import('./parse.worker.js');
  await new Promise((r) => setTimeout(r, 30));
  return message.kind === 'file'
    ? mod.processFile(message.buffer, message.fileName, message.now, onProgress)
    : mod.processRows(message.header, message.rows, message.now, message.label, onProgress, message.extras);
}

async function run(message, onProgress) {
  try { return await runInWorker(message, onProgress); } catch (e) {
    if (/could not be processed|Missing|No rows/.test(e.message)) throw e;
    console.warn('Worker unavailable, processing on the main thread:', e);
    return runHere(message, onProgress);
  }
}

export const MAX_MB = 75;

export async function processUpload(file, onProgress) {
  if (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name)) throw new Error('Use an .xlsx, .xlsm or .csv export from NetSuite.');
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`The file is ${(file.size / 1048576).toFixed(0)} MB - the limit is ${MAX_MB} MB.`);
  onProgress?.('Opening the file', 0.03);
  const buffer = await file.arrayBuffer();
  return run({ kind: 'file', buffer, fileName: file.name, now: Date.now() }, onProgress);
}

const NOT_CONNECTED = 'NetSuite sync is not connected on this site yet. Upload the export file instead.';
const PARALLEL = 5; // NetSuite allows a handful of concurrent REST requests per integration

async function fetchPage(key, table, page) {
  for (let attempt = 1; ; attempt++) {
    let r;
    try {
      r = await authFetch(`./api/netsuite-sync?table=${table}&page=${page}`, { headers: { 'x-upload-key': key }, cache: 'no-store' });
    } catch {
      if (attempt < 3) { await new Promise((res) => setTimeout(res, 1500 * attempt)); continue; }
      throw new Error(NOT_CONNECTED);
    }
    const json = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
    if (r.ok && json) return json;
    if (r.status === 404 || !json) throw new Error(NOT_CONNECTED);
    // 429 = NetSuite concurrency limit, 502 = a NetSuite hiccup: worth another try
    if ((r.status === 429 || r.status === 502) && attempt < 3) { await new Promise((res) => setTimeout(res, 2000 * attempt)); continue; }
    throw new Error(json.error || `NetSuite returned an error (${r.status}).`);
  }
}

/** NetSuite Data Sync: pulls each SuiteQL table page by page through the site's netsuite-sync function, then joins them. */
export async function pullNetSuite(key, onProgress) {
  const names = Object.keys(TABLES);
  const pages = Object.fromEntries(names.map((n) => [n, []]));
  // First page of every table tells us how many pages each one has.
  const firsts = await Promise.all(names.map((n) => fetchPage(key, n, 0)));
  const queue = [];
  firsts.forEach((j, k) => { pages[names[k]][0] = j.rows; for (let p = 1; p < j.pageCount; p++) queue.push([names[k], p]); });
  const all = queue.length + names.length;
  let done = names.length;
  const report = () => onProgress?.(`Pulling from NetSuite - ${done} of ${all} pages`, Math.min(0.55, 0.05 + 0.5 * (done / all)));
  report();
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (queue.length) {
      const [n, p] = queue.shift();
      pages[n][p] = (await fetchPage(key, n, p)).rows;
      done++; report();
    }
  }));
  const tables = Object.fromEntries(names.map((n) => [n, pages[n].flat()]));
  const { header, rows, extras } = mergeTables(tables);
  return { header, rows, extras, total: rows.length };
}

/** extras: NetSuite-only data beside the rows ({ landed, bills }), see mergeTables. */
export async function processRows(header, rows, label, onProgress, extras) {
  return run({ kind: 'rows', header, rows, extras, label, now: Date.now() }, onProgress);
}
