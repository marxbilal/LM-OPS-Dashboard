// Compact columnar format for storing / transferring a dataset.
// Strings are dictionary-encoded, numbers kept as numbers (money rounded to 2 dp),
// arrays/objects JSON-encoded. Derived vehicle fields are recomputed on unpack.
import { deriveVehicles } from './pipeline.js';

export const FORMAT = 'lm-scm-dataset/1';

const V_FIELDS = ['id', 'ch', 'chRaw', 'brand', 'model', 'trim', 'my', 'fuel', 'entity', 'loc', 'locType', 'site', 'vs', 'ss',
  'stage', 'comm', 'group', 'po', 'poDate', 'vendor', 'route', 'ship', 'ibv', 'ibvStatus', 'ibvDate', 'recv', 'purchaseDate',
  'start', 'startBasis', 'pp', 'lc', 'tc', 'lcs', 'vst', 'vstDate', 'cust', 'rep', 'destRaw', 'destC', 'destT', 'out',
  'outPrice', 'flags', 'cards', 'seq', 'veh', 'vin', 'color', 'modelCode'];
const S_FIELDS = ['no', 'status', 'stage', 'entity', 'ibv', 'ibvStatus', 'route', 'pos', 'vendors', 'brands', 'mainModel', 'units',
  'unitsHdr', 'containers', 'mode', 'bl', 'blSource', 'vessel', 'pol', 'polC', 'pod', 'podC', 'poDate', 'created', 'etd', 'atd',
  'eta', 'etaSource', 'ata', 'recv', 'receiveBy', 'copied', 'dPoShip', 'dShipRecv', 'dPoRecv', 'rVsEta', 'ataVsEta', 'rVsRb',
  'daysOpen', 'inStockNow', 'openVsoNow', 'dispatchedNow', 'pp', 'lc', 'lcPerUnit', 'lcs', 'memo', 'ibvMemo'];
const P_FIELDS = ['no', 'internalId', 'date', 'entity', 'branch', 'poLocation', 'vendor', 'vendorNo', 'route', 'ccy', 'fx', 'total',
  'totalAED', 'vat', 'brands', 'models', 'carded', 'received', 'inTransit', 'inStockNow', 'dispatchedNow', 'shipments',
  'cardedValue', 'coverage', 'notCarded', 'lcPosted', 'status', 'isOpen', 'daysSince', 'receiveBy', 'overdue', 'firstReceipt',
  'lastReceipt', 'terms', 'advanceRequired', 'paid', 'balance', 'paidPct', 'paidAED', 'balanceAED', 'lastPayment', 'payCheck',
  'approval', 'approvedBy', 'approvedDate', 'approvalLead', 'releasedBy', 'fxCheck', 'memo', 'notes'];

function packCol(vals) {
  let kind = null;
  for (const x of vals) {
    if (x == null) continue;
    const k = Array.isArray(x) || typeof x === 'object' ? 'j' : typeof x === 'number' ? 'n' : typeof x === 'boolean' ? 'b' : 's';
    if (kind && kind !== k) { kind = 'j'; break; }
    kind = k;
  }
  if (!kind) return { t: 'z' };
  if (kind === 'n') return { t: 'n', v: vals.map((x) => (x == null ? null : Math.round(x * 100) / 100)) };
  if (kind === 'b') return { t: 'b', v: vals.map((x) => (x == null ? -1 : x ? 1 : 0)) };
  if (kind === 'j') return { t: 'j', v: vals.map((x) => (x == null ? null : x)) };
  const dict = [], pos = new Map();
  const v = vals.map((x) => {
    if (x == null) return -1;
    let i = pos.get(x);
    if (i === undefined) { i = dict.length; dict.push(x); pos.set(x, i); }
    return i;
  });
  return { t: 's', d: dict, v };
}

function unpackCol(c, n) {
  if (c.t === 'z') return new Array(n).fill(null);
  if (c.t === 'n' || c.t === 'j') return c.v;
  if (c.t === 'b') return c.v.map((x) => (x === -1 ? null : x === 1));
  return c.v.map((i) => (i === -1 ? null : c.d[i]));
}

function packTable(rows, fields) {
  const cols = {};
  for (const f of fields) cols[f] = packCol(rows.map((r) => r[f]));
  return { n: rows.length, cols };
}

function unpackTable(t) {
  const names = Object.keys(t.cols);
  const arrays = names.map((f) => unpackCol(t.cols[f], t.n));
  const rows = new Array(t.n);
  for (let i = 0; i < t.n; i++) {
    const o = {};
    for (let k = 0; k < names.length; k++) o[names[k]] = arrays[k][i];
    rows[i] = o;
  }
  return rows;
}

export function packDataset(ds) {
  return {
    format: FORMAT, meta: ds.meta, validation: ds.validation,
    V: packTable(ds.V.map((v) => ({ ...v, flags: v.flags && v.flags.length ? v.flags.join(';') : null })), V_FIELDS),
    S: packTable(ds.S, S_FIELDS), P: packTable(ds.P, P_FIELDS),
    LC: ds.LC ?? null, // landed-cost split per IBV (NetSuite sync only)
  };
}

export function unpackDataset(packed) {
  if (!packed || packed.format !== FORMAT) throw new Error('This saved dataset is from an older version - upload the export again.');
  const V = deriveVehicles(unpackTable(packed.V), packed.meta.asOf);
  for (const v of V) v.flags = typeof v.flags === 'string' ? v.flags.split(';') : [];
  return { meta: packed.meta, validation: packed.validation, V, S: unpackTable(packed.S), P: unpackTable(packed.P), LC: packed.LC ?? null };
}
