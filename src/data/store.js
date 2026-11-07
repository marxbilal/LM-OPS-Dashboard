import { authFetch } from './auth.js';

// Where the live dataset is kept.
//  - shared : Netlify Function + Netlify Blobs (/api/dataset) - everyone sees the same upload
//  - local  : IndexedDB in this browser (used when the site has no functions, e.g. a drag-and-drop deploy)
//  - snapshot: a bundled data/snapshot.json(.gz) file shipped with the site, used until a first upload
const DB = 'lm-scm-dashboard', STORE = 'kv';
const API = './api/dataset';
const CHUNK = 4 * 1024 * 1024; // stay well under the 6 MB function payload limit

function idb() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}
async function idbGet(key) {
  try {
    const db = await idb();
    return await new Promise((res, rej) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => res(r.result ?? null); r.onerror = () => rej(r.error);
    });
  } catch { return null; }
}
async function idbSet(key, val) {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    return true;
  } catch { return false; }
}

async function gzip(text) {
  if (typeof CompressionStream === 'undefined') return { bytes: new TextEncoder().encode(text), encoding: 'identity' };
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), encoding: 'gzip' };
}
async function gunzipToText(buf, encoding) {
  if (encoding !== 'gzip') return new TextDecoder().decode(buf);
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

/** Is the shared store available on this deployment? Returns the current pointer or null. */
export async function remoteStatus() {
  try {
    const r = await authFetch(API, { cache: 'no-store' });
    if (!r.ok || r.headers.get('x-lm-store') !== '1') return { available: false };
    return { available: true, current: await r.json() };
  } catch { return { available: false }; }
}

async function loadRemote(pointer) {
  if (!pointer || pointer.empty || !pointer.version) return null;
  const parts = [];
  for (let i = 0; i < pointer.parts; i++) {
    const r = await authFetch(`${API}?version=${encodeURIComponent(pointer.version)}&part=${i}`);
    if (!r.ok) throw new Error(`Could not download part ${i + 1} of the shared dataset.`);
    parts.push(new Uint8Array(await r.arrayBuffer()));
  }
  const all = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  return JSON.parse(await gunzipToText(all, pointer.encoding));
}

async function saveRemote(packed, key, onProgress, chunk = CHUNK) {
  const version = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const { bytes, encoding } = await gzip(JSON.stringify(packed));
  const parts = Math.max(1, Math.ceil(bytes.length / chunk));
  for (let i = 0; i < parts; i++) {
    const r = await authFetch(`${API}?version=${version}&part=${i}`, {
      method: 'PUT', headers: { 'content-type': 'application/octet-stream', 'x-upload-key': key },
      body: bytes.slice(i * chunk, (i + 1) * chunk),
    });
    if (r.status === 403) throw new Error('The shared store refused the upload key.');
    if (!r.ok) throw new Error(`Saving part ${i + 1} of ${parts} failed (${r.status}).`);
    onProgress?.((i + 1) / (parts + 1));
  }
  const c = await authFetch(`${API}?commit=1`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-upload-key': key },
    body: JSON.stringify({ version, parts, encoding, bytes: bytes.length, meta: packed.meta }),
  });
  if (!c.ok) throw new Error(`Publishing the dataset failed (${c.status}).`);
  onProgress?.(1);
  return { version };
}

async function loadSnapshot() {
  for (const [path, enc] of [['./data/snapshot.json.gz', 'gzip'], ['./data/snapshot.json', 'identity']]) {
    try {
      const r = await fetch(path, { cache: 'no-store' });
      if (!r.ok) continue;
      const buf = new Uint8Array(await r.arrayBuffer());
      const isGz = buf[0] === 0x1f && buf[1] === 0x8b;
      return JSON.parse(await gunzipToText(buf, isGz ? 'gzip' : enc === 'gzip' ? 'identity' : enc));
    } catch { /* try next */ }
  }
  return null;
}

/** Load the newest dataset available: shared store, then this browser, then the bundled snapshot. */
export async function loadDataset() {
  const rs = await remoteStatus();
  if (rs.available && rs.current && !rs.current.empty) {
    try {
      const local = await idbGet('dataset');
      if (local && local.__version === rs.current.version) return { packed: local, source: 'shared', shared: true };
      const packed = await loadRemote(rs.current);
      if (packed) { idbSet('dataset', { ...packed, __version: rs.current.version }); return { packed, source: 'shared', shared: true }; }
    } catch (e) { console.warn(e); }
  }
  const local = await idbGet('dataset');
  if (local) return { packed: local, source: local.__version ? 'shared-cache' : 'local', shared: rs.available };
  const snap = await loadSnapshot();
  if (snap) return { packed: snap, source: 'snapshot', shared: rs.available };
  return { packed: null, source: null, shared: rs.available };
}

/** Save a new dataset. Shared store when available, always cached in this browser. */
export async function saveDataset(packed, key, onProgress, opts = {}) {
  const rs = await remoteStatus();
  if (rs.available) {
    const { version } = await saveRemote(packed, key, onProgress, opts.chunk);
    await idbSet('dataset', { ...packed, __version: version });
    return { mode: 'shared' };
  }
  const ok = await idbSet('dataset', packed);
  onProgress?.(1);
  if (!ok) throw new Error('This browser blocked local storage, so the upload only lasts until the page is closed.');
  return { mode: 'local' };
}

// Dashboard settings (which pages are hidden). Shared through the dataset function so every viewer gets
// the same menu; falls back to this browser when the site has no functions.
const SETTINGS_KEY = 'lm-scm-settings';
export const DEFAULT_SETTINGS = { hiddenPages: ['costs'] }; // Costs stays hidden until switched on in Upload Data

export async function loadSettings() {
  try {
    const r = await authFetch(`${API}?settings=1`, { cache: 'no-store' });
    if (r.ok && r.headers.get('x-lm-store') === '1') {
      const j = await r.json();
      return { ...DEFAULT_SETTINGS, ...(Array.isArray(j.hiddenPages) ? { hiddenPages: j.hiddenPages } : {}), shared: true };
    }
  } catch { /* no shared store - use this browser */ }
  try {
    const j = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (j && Array.isArray(j.hiddenPages)) return { ...DEFAULT_SETTINGS, hiddenPages: j.hiddenPages, shared: false };
  } catch { /* storage blocked */ }
  return { ...DEFAULT_SETTINGS, shared: false };
}

export async function saveSettings(settings, key) {
  const body = { hiddenPages: settings.hiddenPages || [] };
  const rs = await remoteStatus();
  if (rs.available) {
    const r = await authFetch(`${API}?settings=1`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-upload-key': key }, body: JSON.stringify(body) });
    if (r.status === 403) throw new Error('The shared store refused the upload key.');
    if (!r.ok) throw new Error(`Saving the setting failed (${r.status}).`);
    return { ...body, shared: true };
  }
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(body)); } catch { throw new Error('This browser blocked local storage, so the setting was not saved.'); }
  return { ...body, shared: false };
}
