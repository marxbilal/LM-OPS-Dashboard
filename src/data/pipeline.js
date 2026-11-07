// Supply Chain & Operations data pipeline.
// Input : the NetSuite vehicle export (one row per Vehicle Card / Internal ID) as
//         { header: string[], rows: any[][] } - from an Excel/CSV upload or the NetSuite sync.
// Output: { meta, V (vehicles), S (shipments), P (purchase orders), validation }.
// Pure module: runs in the browser worker and in Node (for tests).

import { LOCATION_MAP, JUNK, BRAND_MAP, cleanPort, cleanDestination } from './lookups.js';

export const DAY = 86400000;
export const PIPELINE_VERSION = 1;

// ------------------------------------------------------------------ columns
export const EXPECTED_COLUMNS = [
  'Date Created', 'Customer', 'Vehicle Sales Order', 'VST Memo', 'Internal ID', 'Chassis Number', 'Brand', 'Model', 'Trim',
  'Transmission', 'Fuel Type', 'Engine Capacity', 'Exterior Color', 'Interior Color', 'Model Year', 'Model Code', 'List Price',
  'Shipment Status', 'Vehicle Status', 'Purchase Date', 'Subsidiary', 'Location', 'Purchase Price', 'Purchase Currency',
  'Landed Cost', 'Total Cost', 'Out Price', 'Out Currency', 'Out Date', 'Sales Rep', 'Destination Port: VST',
  'Destination Port: Outbound', 'IBV Qty', 'IBV ID', 'IBV Date', 'IBV Status', 'Receiving Date', 'IBV Memo', 'IBV Subsidiary',
  'Shipment No', 'Shipment Status2', 'Bill of Lading', 'Vessel Voyage', 'Port Of Loading', 'Port Of Discharge', 'Containers',
  'Units On Shipment', 'Shipment Created', 'Expected Shipping Date', 'Actual Shipping Date', 'Expected Arrival Date',
  'Actual Delivery Date', 'Shipment Memo', 'PO #', 'PO Date', 'Vendor', 'Vendor #', 'PO Currency', 'PO Exchange Rate',
  'Receive By', 'PO Memo', 'PO Subsidiary', 'Branch', 'PO Location', 'Advance Payment Required', 'Advance Amount',
  'Internal Notes', 'PO Advance Amount', 'PO Advance Remaining', 'PO Advance Date', 'PO Approval Status', 'Approved By',
  'Approved Date', 'Released By', 'PO Total', 'IBV Internal ID', 'PO Internal ID',
];
// Without these the dashboard cannot be built - the upload is rejected.
export const REQUIRED_COLUMNS = ['Internal ID', 'Chassis Number', 'Brand', 'Model', 'Vehicle Status', 'Shipment Status',
  'Purchase Date', 'Subsidiary', 'Location', 'Purchase Price', 'Landed Cost', 'Total Cost', 'IBV Date', 'Shipment No', 'PO #'];

const DATE_COLS = ['Date Created', 'Purchase Date', 'Out Date', 'IBV Date', 'Receiving Date', 'Shipment Created',
  'Expected Shipping Date', 'Actual Shipping Date', 'Expected Arrival Date', 'Actual Delivery Date', 'PO Date', 'Receive By',
  'PO Advance Date', 'Approved Date'];
const NUM_COLS = ['Internal ID', 'Model Year', 'List Price', 'Purchase Price', 'Landed Cost', 'Total Cost', 'Out Price', 'IBV Qty',
  'PO Exchange Rate', 'Advance Amount', 'PO Advance Amount', 'PO Advance Remaining', 'PO Total', 'IBV Internal ID', 'PO Internal ID'];
const PLACEHOLDER_COLS = ['Bill of Lading', 'Vessel Voyage', 'Port Of Loading', 'Port Of Discharge', 'Containers',
  'Units On Shipment', 'Approved By', 'Released By'];

const canon = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9#]/g, '');
const ALIASES = {
  shipmentstatus1: 'shipmentstatus2', shipmentstatus_2: 'shipmentstatus2',
  destinationportvst: 'destinationportvst', destinationportoutbound: 'destinationportoutbound',
  po: 'po#', ponumber: 'po#', vendornumber: 'vendor#',
};

export function mapColumns(header) {
  const want = new Map(EXPECTED_COLUMNS.map((c) => [canon(c), c]));
  const idx = {};
  const extra = [];
  header.forEach((h, i) => {
    let k = canon(h);
    if (ALIASES[k]) k = ALIASES[k];
    const name = want.get(k);
    if (name && idx[name] === undefined) idx[name] = i;
    else if (String(h ?? '').trim()) extra.push(String(h));
  });
  const missing = EXPECTED_COLUMNS.filter((c) => idx[c] === undefined);
  return { idx, missing, extra };
}

// ------------------------------------------------------------------ value parsing
const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const utcDay = (y, m, d) => {
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1990 && y <= 2100)) return null;
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCMonth() !== m - 1) return null; // 31 Feb etc.
  return Math.floor(t / DAY);
};

function toDay(v, dayFirst = true) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) return Math.floor(v) - 25569; // Excel serial
    if (v > 1e11) return Math.floor(v / DAY); // epoch ms
    return null;
  }
  if (v instanceof Date) return isNaN(v) ? null : Math.floor(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()) / DAY);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return utcDay(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return dayFirst ? utcDay(+m[3], +m[2], +m[1]) : utcDay(+m[3], +m[1], +m[2]);
  m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3})[A-Za-z]*[ -,]*(\d{2,4})/);
  if (m && MONTHS[m[2].toUpperCase()]) return utcDay(+m[3], MONTHS[m[2].toUpperCase()], +m[1]);
  if (/^\d+(\.\d+)?$/.test(s)) return toDay(parseFloat(s));
  return null;
}

function detectDayFirst(values) {
  let first = false, second = false;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const m = v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) first = true;
    if (+m[2] > 12) second = true;
    if (first || second) break;
  }
  return first || !second;
}

function toNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = String(v).replace(/[,\s]/g, '').replace(/^AED/i, '');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

// Non-breaking spaces and the U+FFFD replacement character (broken encodings) become plain spaces.
// Built from escapes so the minified bundle stays plain ASCII here.
const JUNK_SPACE = new RegExp('[\\u00a0\\ufffd]', 'g');

function toText(v) {
  if (v == null) return null;
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).replace(JUNK_SPACE, ' ').trim();
  return s === '' ? null : s;
}

export const dayToISO = (d) => (d == null ? null : new Date(d * DAY).toISOString().slice(0, 10));

// ------------------------------------------------------------------ helpers
function mode(arr) {
  const c = new Map();
  for (const x of arr) if (x != null) c.set(x, (c.get(x) || 0) + 1);
  let best = null, n = -1;
  for (const [k, v] of [...c.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) if (v > n) { best = k; n = v; }
  return best;
}
function topN(arr, n) {
  const c = new Map();
  for (const x of arr) if (x != null) c.set(x, (c.get(x) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);
}
const ENT = { 'LMF-TRADE': 'LMF', 'LMM-TRADE': 'LMM', AMF: 'AMF' };

export function bucket4(d) {
  if (d == null) return null;
  return d <= 30 ? '0-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : '90+';
}
export function bucket6(d) {
  if (d == null) return null;
  return d <= 30 ? '0-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : d <= 180 ? '91-180' : d <= 365 ? '181-365' : '365+';
}

const COMM = {
  Available: 'Unreserved', 'VSO Reserved': 'Reserved (not fully paid)', 'VSO Fulfilled': 'Paid - awaiting delivery',
  Sold: 'Sold', 'Delivered not Invoiced': 'Delivered - not invoiced', Blocked: 'On hold', Damaged: 'On hold',
  'Marked For Purchase Return': 'On hold',
};
export const COMMERCIAL = ['Unreserved', 'Reserved (not fully paid)', 'Paid - awaiting delivery', 'On hold'];
const UAE_VENDOR = /\bFZE\b|FZCO|F\.Z\.E|L\.?\s?L\.?\s?C|\bDMCC\b|FZ-LLC|FZ LLC/;
const BL_RE = /\bB\s*\/?\s*L\b\.?\s*(?:NO\.?|NUMBER|#)?\s*[:.-]?\s*([A-Z]{1,6}[A-Z0-9]{5,18}|\d{8,14})/;

/** Fields that depend on the as-of date or are cheap to recompute (not stored). */
export function deriveVehicles(V, asOf) {
  for (const v of V) {
    const st = v.stage;
    v.inStock = st === 'In stock';
    v.inTransit = st === 'In transit';
    v.dispatched = st === 'Dispatched';
    v.days = v.inStock && v.start != null ? Math.max(0, asOf - v.start) : null;
    v.bucket = bucket4(v.days);
    v.bucket6 = bucket6(v.days);
    v.daysTransit = v.inTransit && (v.ibvDate ?? v.purchaseDate) != null ? asOf - (v.ibvDate ?? v.purchaseDate) : null;
    const openVso = (v.comm === 'Reserved (not fully paid)' || v.comm === 'Paid - awaiting delivery') && (v.inStock || v.inTransit);
    v.openVso = openVso;
    v.daysVst = openVso && v.vstDate != null ? asOf - v.vstDate : null;
    v.dVstDisp = v.dispatched && v.out != null && v.vstDate != null ? v.out - v.vstDate : null;
    const s2d = v.dispatched && v.out != null && v.start != null ? v.out - v.start : null;
    v.dStockDisp = s2d != null && s2d >= 0 ? s2d : null;
    v.lcPct = v.lc > 0 && v.pp > 0 ? v.lc / v.pp : null;
  }
  return V;
}

// ================================================================== main
export function buildDataset(input, opts = {}) {
  const t0 = Date.now();
  const { header, rows, landed, bills } = input;
  const today = Math.floor((opts.now ?? Date.now()) / DAY);
  const focusYear = opts.focusYear ?? null; // default: year of as-of date
  const errors = [], warnings = [];

  // ---------- columns
  const { idx, missing, extra } = mapColumns(header);
  const missingRequired = REQUIRED_COLUMNS.filter((c) => idx[c] === undefined);
  if (missingRequired.length) errors.push(`Missing required column(s): ${missingRequired.join(', ')}.`);
  if (!rows.length) errors.push('The file has no data rows.');
  if (errors.length) {
    return { validation: { accepted: false, errors, warnings, columns: { expected: EXPECTED_COLUMNS.length, found: EXPECTED_COLUMNS.length - missing.length, missing, extra } } };
  }
  if (missing.length) warnings.push(`${missing.length} optional column(s) not found: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '...' : ''}. Related views will be empty.`);

  const get = (r, c) => (idx[c] === undefined ? null : r[idx[c]]);
  const dayFirst = {};
  for (const c of DATE_COLS) if (idx[c] !== undefined) dayFirst[c] = detectDayFirst(rows.slice(0, 5000).map((r) => r[idx[c]]));

  // ---------- rows -> raw records
  const COLS = EXPECTED_COLUMNS.map((c) => [c, idx[c], DATE_COLS.includes(c) ? 'd' : NUM_COLS.includes(c) ? 'n' : 't']);
  const log = [];
  let skippedNoId = 0, placeholdersCleared = 0;
  const byId = new Map();
  let dupIds = 0;
  for (const r of rows) {
    if (!r || !r.length) continue;
    const id = toNum(get(r, 'Internal ID'));
    if (id == null) { skippedNoId++; continue; }
    const o = { _id: id };
    for (let k = 0; k < COLS.length; k++) {
      const [c, j, t] = COLS[k];
      if (j === undefined) { o[c] = null; continue; }
      const raw = r[j];
      o[c] = t === 'd' ? toDay(raw, dayFirst[c]) : t === 'n' ? toNum(raw) : toText(raw);
    }
    for (const c of PLACEHOLDER_COLS) {
      const s = o[c];
      if (s != null && JUNK.has(String(s).toUpperCase().trim())) { o[c] = null; placeholdersCleared++; }
    }
    if (byId.has(id)) dupIds++;
    byId.set(id, o);
  }
  const R = [...byId.values()];
  const N = R.length;
  if (!N) return { validation: { accepted: false, errors: ['No rows with an Internal ID were found.'], warnings } };

  // ---------- as-of date: latest activity date in the file, never later than today
  let dMin = Infinity, dMax = -Infinity, act = -Infinity;
  for (const o of R) {
    for (const c of ['Date Created', 'Out Date', 'Receiving Date', 'Shipment Created', 'IBV Date', 'PO Date', 'Purchase Date']) {
      const d = o[c];
      if (d == null) continue;
      if (d < dMin) dMin = d;
      if (d > dMax) dMax = d;
      if (c !== 'Purchase Date' && d > act && d <= today) act = d;
    }
  }
  const asOf = isFinite(act) ? act : today;
  const FY = focusYear ?? new Date(asOf * DAY).getUTCFullYear();

  // ---------- vehicles
  const V = new Array(N);
  let junkChars = 0, ioq = 0, nonVeh = 0, invalidVin = 0, brandFixed = 0, my2 = 0;
  const vinExamples = [], invalidExamples = [];
  for (let i = 0; i < N; i++) {
    const o = R[i];
    const chRaw = o['Chassis Number'] ?? '';
    let ch = String(chRaw).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const junk = ch !== String(chRaw).toUpperCase();
    if (junk) { junkChars++; if (vinExamples.length < 4) vinExamples.push(String(chRaw)); }
    let fixed = false;
    if (ch.length === 17 && /[IOQ]/.test(ch)) { ch = ch.replace(/I/g, '1').replace(/[OQ]/g, '0'); fixed = true; ioq++; }
    const modelU = String(o.Model ?? '').toUpperCase();
    const isNonVeh = /CHARGER|FORKLIFT|SPARE PART/.test(modelU) || /SPAREPART|CHARGER/.test(ch);
    if (isNonVeh) nonVeh++;
    const vin = /^[A-HJ-NPR-Z0-9]{17}$/.test(ch) && !isNonVeh;
    if (!vin && !isNonVeh) { invalidVin++; if (invalidExamples.length < 4) invalidExamples.push(String(chRaw)); }

    const b0 = o.Brand;
    let brand = b0 == null ? null : String(b0).toUpperCase();
    if (brand && BRAND_MAP[brand]) brand = BRAND_MAP[brand];
    if (b0 != null && brand !== b0) brandFixed++;
    let my = o['Model Year'];
    if (my != null && my < 100) { my += 2000; my2++; }

    const custM = o.Customer ? String(o.Customer).match(/^(\d+)\s+(.*)$/) : null;
    const repM = o['Sales Rep'] ? String(o['Sales Rep']).match(/^(\d+)\s+(.*)$/) : null;
    const loc = o.Location;
    const lm = LOCATION_MAP[loc] || ['Other', loc ?? 'Unknown'];
    const poSub = o['PO Subsidiary'] ? String(o['PO Subsidiary']).split(':').pop().trim() : null;

    V[i] = {
      id: o._id, ch, chRaw: ch !== String(chRaw) ? String(chRaw) : null, vin, veh: !isNonVeh, junk, ioqFixed: fixed,
      brand, model: o.Model, modelCode: o['Model Code'], trim: o.Trim, my, fuel: o['Fuel Type'], trans: o.Transmission, color: o['Exterior Color'],
      entity: ENT[o.Subsidiary] ?? o.Subsidiary, sub: o.Subsidiary, loc, locType: lm[0], site: lm[1],
      vs: o['Vehicle Status'], ss: o['Shipment Status'],
      po: o['PO #'], poDate: o['PO Date'], poEntity: ENT[poSub] ?? poSub, vendor: o.Vendor, vendorNo: o['Vendor #'], poCcy: o['PO Currency'],
      ship: o['Shipment No'], ibv: o['IBV ID'], ibvStatus: o['IBV Status'], ibvDate: o['IBV Date'], recv: o['Receiving Date'],
      purchaseDate: o['Purchase Date'], receiveBy: o['Receive By'],
      pp: o['Purchase Price'], lc: o['Landed Cost'], tc: o['Total Cost'], pCcy: o['Purchase Currency'], listPrice: o['List Price'],
      vst: o['Vehicle Sales Order'], vstDate: o['Date Created'], vstMemo: o['VST Memo'],
      custCode: custM ? custM[1] : null, cust: custM ? custM[2] : o.Customer,
      repCode: repM ? repM[1] : null, rep: repM ? repM[2] : o['Sales Rep'],
      destVst: o['Destination Port: VST'], destOut: o['Destination Port: Outbound'],
      out: o['Out Date'], outPrice: o['Out Price'],
    };
  }
  log.push(['Text', `Trimmed text, removed corrupted characters, cleared ${placeholdersCleared.toLocaleString()} placeholder values ('-', '\`', '.', '0') in shipment and approval fields`]);
  log.push(['Chassis', `${junkChars} chassis numbers stripped of junk characters; ${ioq} VINs with I/O/Q corrected; ${nonVeh} non-vehicle items flagged`]);
  log.push(['Attributes', `${brandFixed.toLocaleString()} brand spellings unified; ${my2.toLocaleString()} two-digit model years made four-digit`]);

  // ---------- lifecycle stage (decision: Sold counts as moved out whatever the shipment status)
  const stageCounts = {};
  for (const v of V) {
    const vs = v.vs, ss = v.ss;
    let st;
    if (!v.veh) st = 'Excluded - non-vehicle item';
    else if (vs === 'After Sales') st = 'Excluded - after-sales card';
    else if (vs === 'Capitalized') st = 'Excluded - capitalized asset';
    else if (vs === 'Transferred') st = 'Closed - transferred to other entity';
    else if (vs === 'Sales Returned') st = 'Closed - sales return (re-carded)';
    else if (vs === 'Purchase Returned') st = 'Closed - returned to supplier';
    else if (vs === 'Sold' || vs === 'Delivered not Invoiced') st = 'Dispatched';
    else if (ss === 'Locked-In Transit') st = 'In transit';
    else if (ss === 'Shipped') st = 'Check - shipped but status open';
    else st = 'In stock';
    v.stage = st;
    v.comm = st.startsWith('Excluded') || st.startsWith('Closed') ? 'n/a' : (COMM[vs] ?? 'n/a');
    v.group = st === 'In stock' ? 'Inventory' : st === 'In transit' ? 'Inbound pipeline' : st === 'Dispatched' ? 'Dispatched'
      : st.startsWith('Check') ? 'Check' : st.startsWith('Closed') ? 'Closed / superseded' : 'Excluded';
    stageCounts[st] = (stageCounts[st] || 0) + 1;
  }

  // ---------- chassis chains (a car moved between entities or returned gets a new card)
  // Decision: age counts from the card's IBV date - when the car became Available in NetSuite.
  const chains = new Map();
  for (const v of V) {
    v.cards = 1; v.seq = 1;
    v.start = v.ibvDate ?? v.purchaseDate;
    v.startBasis = v.ibvDate != null ? 'IBV date' : 'Purchase date (no IBV)';
    if (!v.veh || v.vs === 'After Sales' || !v.ch) continue;
    if (!chains.has(v.ch)) chains.set(v.ch, []);
    chains.get(v.ch).push(v);
  }
  let multiChassis = 0, cardsInChains = 0;
  for (const list of chains.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.id - b.id);
    multiChassis++; cardsInChains += list.length;
    list.forEach((v, k) => { v.cards = list.length; v.seq = k + 1; });
  }
  log.push(['Ageing', `${cardsInChains.toLocaleString()} cards belong to ${multiChassis.toLocaleString()} cars that moved between entities or came back; only each car's current card counts. Age counts from the card's IBV date (purchase date where no IBV)`]);

  let ageEstimated = 0;
  deriveVehicles(V, asOf);
  for (const v of V) {
    if (v.inStock && v.startBasis !== 'IBV date') ageEstimated++;
    v.outBeforeArrival = v.dispatched && v.out != null && v.start != null && v.out < v.start;
  }

  // ---------- costs
  let tcChecked = 0, tcBad = 0;
  const tcExamples = [];
  for (const v of V) {
    if (v.tc != null) {
      tcChecked++;
      if (Math.abs(v.tc - ((v.pp ?? 0) + (v.lc ?? 0))) > 1) { tcBad++; if (tcExamples.length < 5) tcExamples.push(v.id); }
    }
    const vu = String(v.vendor ?? '').toUpperCase();
    v.route = !v.po ? 'No PO (transfer / internal / legacy)' : (UAE_VENDOR.test(vu) || v.poCcy === 'AED') ? 'Local (UAE vendor)' : 'Import (overseas vendor)';
    v.lcs = !v.po ? 'n/a (no PO)' : v.lc > 0 ? 'Posted' : v.inTransit ? 'Pending (in transit)'
      : v.route === 'Import (overseas vendor)' ? 'Not posted - import' : 'Not posted - local purchase';
  }

  // ---------- destination (Outbound port takes priority over VST port)
  let fromOut = 0, fromVst = 0, neither = 0;
  const destMap = new Map();
  for (const v of V) {
    const raw = v.destOut ?? v.destVst;
    if (v.destOut != null) fromOut++; else if (v.destVst != null) fromVst++; else neither++;
    const [c, t] = cleanDestination(raw);
    v.destRaw = raw; v.destC = c; v.destT = t;
    if (raw != null) {
      const key = `${c}|${t}`;
      if (!destMap.has(key)) destMap.set(key, { country: c, type: t, spellings: new Map(), units: 0 });
      const e = destMap.get(key);
      e.units++;
      const sp = String(raw).trim();
      e.spellings.set(sp, (e.spellings.get(sp) || 0) + 1);
    }
  }

  // ---------- flags
  for (const v of V) {
    const f = [];
    if (v.junk) f.push('CHASSIS_CLEANED');
    if (v.ioqFixed) f.push('VIN_IOQ_FIXED');
    if (!v.veh) f.push('NON_VEHICLE');
    if (v.stage.startsWith('Check')) f.push('STATUS_CONFLICT');
    if (v.inStock && v.locType === 'Pending Receiving') f.push('LOCATION_NOT_UPDATED');
    if (v.inStock && v.startBasis !== 'IBV date') f.push('AGE_ESTIMATED');
    if (v.lcs === 'Not posted - import') f.push('LANDED_COST_MISSING');
    if (v.outBeforeArrival) f.push('OUT_BEFORE_ARRIVAL');
    v.flags = f;
    delete v.junk; delete v.ioqFixed; delete v.outBeforeArrival;
  }

  // ================================================================ shipments
  const shipHdr = ['Shipment Status2', 'Bill of Lading', 'Vessel Voyage', 'Port Of Loading', 'Port Of Discharge', 'Containers',
    'Units On Shipment', 'Shipment Created', 'Expected Shipping Date', 'Actual Shipping Date', 'Expected Arrival Date',
    'Actual Delivery Date', 'Shipment Memo', 'IBV ID', 'IBV Internal ID', 'IBV Status', 'IBV Date', 'IBV Memo', 'Receiving Date'];
  const sg = new Map();
  R.forEach((o, i) => {
    const no = o['Shipment No'];
    if (!no) return;
    if (!sg.has(no)) sg.set(no, { h: {}, rows: [] });
    const g = sg.get(no);
    for (const c of shipHdr) if (g.h[c] == null && o[c] != null) g.h[c] = o[c];
    g.rows.push(V[i]);
  });
  const S = [];
  let blFromMemo = 0;
  for (const [no, g] of sg) {
    const h = g.h, vs = g.rows;
    const memo = `${h['Shipment Memo'] ?? ''} || ${h['IBV Memo'] ?? ''}`.toUpperCase();
    const blM = memo.match(BL_RE);
    let blField = h['Bill of Lading'] != null ? String(h['Bill of Lading']).toUpperCase().replace(/\s+/g, '') : null;
    if (blField && (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(blField) || blField.startsWith('VST-'))) blField = null;
    const bl = blField ?? (blM ? blM[1] : null);
    if (!blField && blM) blFromMemo++;
    const [pol, polC] = cleanPort(h['Port Of Loading']);
    const [pod, podC] = cleanPort(h['Port Of Discharge']);
    const contRaw = h.Containers != null ? String(h.Containers).toUpperCase() : '';
    const nums = contRaw.match(/\d+/g);
    const containers = nums ? nums.reduce((a, b) => a + +b, 0) : null;
    const mtext = `${h['Shipment Memo'] ?? ''} ${h['IBV Memo'] ?? ''} ${h['Vessel Voyage'] ?? ''} ${h['Port Of Discharge'] ?? ''} ${contRaw}`.toUpperCase();
    const modeS = contRaw.includes('RORO') || /\bRORO\b|RO-RO|BY RO RO/.test(mtext) ? 'RoRo'
      : containers > 0 ? 'Container' : /CNTR|CONTAINER/.test(mtext) ? 'Container'
        : /BY LAND|FROM KUWAIT|\bLAND\b/.test(mtext) ? 'Land (GCC)'
          : /TRANSFER INSIDE|EXW|AUTO ?WHEELS|RECEIVED IN JAFZA|DIRECT SOLD|LOCAL/.test(mtext) ? 'Local / direct' : 'Not stated';
    const statusRaw = h['Shipment Status2'];
    const status = statusRaw === 'received' ? 'Received' : statusRaw === 'inTransit' ? 'In transit' : statusRaw === 'closed' ? 'Closed' : (statusRaw ?? 'Unknown');
    const etaField = h['Expected Arrival Date'];
    const eta = etaField; // ETA is the shipment's Expected Arrival Date only (no dates read from memo text)
    const etd = h['Expected Shipping Date'], atd = h['Actual Shipping Date'], ata = h['Actual Delivery Date'];
    const recv = h['Receiving Date'], created = h['Shipment Created'];
    const poDates = vs.map((v) => v.poDate).filter((d) => d != null);
    const poDate = poDates.length ? Math.min(...poDates) : null;
    const rbs = vs.map((v) => v.receiveBy).filter((d) => d != null);
    const receiveBy = rbs.length ? Math.max(...rbs) : null;
    const pp = vs.reduce((a, v) => a + (v.pp ?? 0), 0);
    const lc = vs.reduce((a, v) => a + (v.lc ?? 0), 0);
    const route = mode(vs.map((v) => v.route));
    const open = status === 'In transit';
    const stage = !open ? 'Received' : eta == null ? 'In transit - no ETA' : eta < asOf ? 'In transit - ETA passed' : 'In transit - ETA ahead';
    const unitsHdr = h['Units On Shipment'] != null ? String(h['Units On Shipment']).match(/\d+/) : null;
    S.push({
      no, status, stage, entity: mode(vs.map((v) => v.entity)), ibv: h['IBV ID'], ibvStatus: h['IBV Status'], route,
      pos: [...new Set(vs.map((v) => v.po).filter(Boolean))].sort(), vendors: [...new Set(vs.map((v) => v.vendor).filter(Boolean))].sort(),
      brands: topN(vs.map((v) => v.brand), 3).map((x) => x[0]), mainModel: topN(vs.map((v) => v.model), 1)[0]?.[0] ?? null,
      units: vs.length, unitsHdr: unitsHdr ? +unitsHdr[0] : null, containers, mode: modeS,
      bl, blSource: blField ? 'Field' : blM ? 'Parsed from memo' : null, vessel: h['Vessel Voyage'] ? String(h['Vessel Voyage']).toUpperCase().replace(/\s+/g, ' ') : null,
      pol, polC, pod, podC, poDate, created, etd, atd, eta, etaSource: etaField != null ? 'Field' : null,
      ata, recv, receiveBy,
      copied: etd != null && atd != null && etaField != null && etd === atd && atd === etaField,
      dPoShip: created != null && poDate != null ? created - poDate : null,
      dShipRecv: recv != null && created != null ? recv - created : null,
      dPoRecv: recv != null && poDate != null ? recv - poDate : null,
      rVsEta: recv != null && eta != null ? recv - eta : null,
      ataVsEta: ata != null && etaField != null ? ata - etaField : null,
      rVsRb: recv != null && receiveBy != null ? recv - receiveBy : null,
      daysOpen: open && created != null ? asOf - created : null,
      inStockNow: vs.filter((v) => v.inStock).length,
      openVsoNow: vs.filter((v) => v.comm === 'Reserved (not fully paid)' || v.comm === 'Paid - awaiting delivery').length,
      dispatchedNow: vs.filter((v) => v.dispatched).length,
      pp, lc, lcPerUnit: lc > 0 ? lc / vs.length : null,
      lcs: lc > 0 ? 'Posted' : open ? 'Pending (in transit)' : route === 'Import (overseas vendor)' ? 'Not posted - import' : 'Not posted - local purchase',
      memo: h['Shipment Memo'], ibvMemo: h['IBV Memo'],
    });
    for (const v of vs) { v.shipStage = stage; v.shipMode = modeS; v.eta = eta; v.bl = bl; v.pod = pod; }
  }
  log.push(['Inbound', `${S.length.toLocaleString()} shipments built (1 shipment = 1 IBV); ${blFromMemo} BL numbers recovered from memo text; ETA = Expected Arrival Date; port spellings unified`]);

  // ================================================================ purchase orders
  const poHdr = ['PO Internal ID', 'PO Date', 'Vendor', 'Vendor #', 'PO Currency', 'PO Exchange Rate', 'Receive By', 'PO Memo',
    'PO Subsidiary', 'Branch', 'PO Location', 'Advance Payment Required', 'Advance Amount', 'Internal Notes', 'PO Advance Amount',
    'PO Advance Remaining', 'PO Advance Date', 'PO Approval Status', 'Approved By', 'Approved Date', 'Released By', 'PO Total'];
  const pg = new Map();
  R.forEach((o, i) => {
    const no = o['PO #'];
    if (!no) return;
    if (!pg.has(no)) pg.set(no, { h: {}, rows: [] });
    const g = pg.get(no);
    for (const c of poHdr) if (g.h[c] == null && o[c] != null) g.h[c] = o[c];
    g.rows.push(V[i]);
  });
  // vendor bills per PO (NetSuite sync only): billed / paid / unpaid in the PO's currency, for every PO from day one
  let billsByPo = null;
  if (Array.isArray(bills) && bills.length) {
    billsByPo = new Map();
    for (const b of bills) {
      if (b.po == null || /cancel|reject/i.test(b.status ?? '')) continue;
      const e = billsByPo.get(String(b.po)) || { billed: 0, paid: 0, unpaid: 0 };
      e.billed += toNum(b.total) || 0; e.paid += toNum(b.paid) || 0; e.unpaid += toNum(b.unpaid) || 0;
      billsByPo.set(String(b.po), e);
    }
  }
  const P = [];
  for (const [no, g] of pg) {
    const h = g.h, vs = g.rows;
    const fx = h['PO Exchange Rate'] ?? 1;
    const total = h['PO Total'];
    const carded = vs.reduce((a, v) => a + (v.pp ?? 0), 0);
    let totalAED = total != null ? total * fx : null;
    let fxCheck = 'OK';
    if (total && Math.abs(fx - 1) > 0.05 && Math.abs(carded / total - 1) < 0.02) { totalAED = total; fxCheck = 'Amounts look like AED despite foreign currency'; }
    const ratio = totalAED ? carded / totalAED : null;
    const vat = h['PO Currency'] === 'AED' && ratio != null && ratio >= 0.945 && ratio <= 0.958;
    const base = totalAED != null ? totalAED / (vat ? 1.05 : 1) : null;
    const coverage = base ? carded / base : null;
    const received = vs.filter((v) => v.ibvStatus === 'Inbound Successful').length;
    const inTransit = vs.filter((v) => v.inTransit).length;
    const notCarded = coverage != null && coverage < 0.98 ? Math.max(0, base - carded) : 0;
    const status = inTransit === 0 && (coverage == null || coverage >= 0.98) ? 'Fully received'
      : received > 0 && inTransit > 0 ? 'Partly received - balance in transit'
        : received === 0 && inTransit > 0 ? 'In transit - nothing received yet' : 'Received - PO value not fully carded';
    const isOpen = inTransit > 0 ? 'Y' : status.startsWith('Received - PO value') ? 'Check' : 'N';
    // payments: the vendor bills when synced from NetSuite (every PO), else the PO advance fields (filled only since mid-2026)
    let paid, bal, payCheck, billed = null, unpaid = null;
    if (billsByPo) {
      const b = billsByPo.get(String(h['PO Internal ID'])) || { billed: 0, paid: 0, unpaid: 0 };
      billed = b.billed; unpaid = b.unpaid; paid = b.paid;
      bal = total != null ? Math.max(0, total - paid) : unpaid;
      payCheck = 'OK';
    } else {
      paid = h['PO Advance Amount']; bal = h['PO Advance Remaining'];
      const hasPay = paid != null || bal != null;
      const s0 = (paid ?? 0) + (bal ?? 0);
      payCheck = !hasPay ? 'No payment data' : total && Math.abs(s0 - total) > 0.02 * total ? 'Paid + balance differ from PO total' : 'OK';
    }
    const sumPay = (paid ?? 0) + (bal ?? 0);
    const fxPay = fxCheck === 'OK' ? fx : 1;
    const recvs = vs.map((v) => v.recv).filter((d) => d != null);
    const poDate = h['PO Date'];
    const poSub = h['PO Subsidiary'] ? String(h['PO Subsidiary']).split(':').pop().trim() : null;
    P.push({
      no, internalId: h['PO Internal ID'], date: poDate, entity: ENT[poSub] ?? poSub, branch: h.Branch, poLocation: h['PO Location'],
      vendor: h.Vendor, vendorNo: h['Vendor #'], route: mode(vs.map((v) => v.route)), ccy: h['PO Currency'], fx, total, totalAED, vat,
      brands: topN(vs.map((v) => v.brand), 3).map((x) => x[0]), models: topN(vs.map((v) => v.model), 3),
      carded: vs.length, received, inTransit, inStockNow: vs.filter((v) => v.inStock).length, dispatchedNow: vs.filter((v) => v.dispatched).length,
      shipments: new Set(vs.map((v) => v.ship).filter(Boolean)).size, cardedValue: carded, coverage, notCarded,
      lcPosted: vs.reduce((a, v) => a + (v.lc ?? 0), 0), status, isOpen,
      daysSince: poDate != null ? asOf - poDate : null, receiveBy: h['Receive By'],
      overdue: isOpen === 'Y' && h['Receive By'] != null && h['Receive By'] < asOf,
      firstReceipt: recvs.length ? Math.min(...recvs) : null, lastReceipt: recvs.length ? Math.max(...recvs) : null,
      terms: h['Advance Payment Required'], advanceRequired: h['Advance Amount'], paid, balance: bal,
      paidPct: sumPay > 0 ? (paid ?? 0) / sumPay : null, paidAED: paid != null ? paid * fxPay : null, balanceAED: bal != null ? bal * fxPay : null,
      lastPayment: h['PO Advance Date'], payCheck, paySource: billsByPo ? 'bills' : 'po-fields',
      billed, unpaid, billedAED: billed != null ? billed * fxPay : null, unpaidAED: unpaid != null ? unpaid * fxPay : null,
      approval: h['PO Approval Status'], approvedBy: h['Approved By'], approvedDate: h['Approved Date'],
      approvalLead: h['Approved Date'] != null && poDate != null ? h['Approved Date'] - poDate : null,
      releasedBy: h['Released By'], fxCheck, memo: h['PO Memo'], notes: h['Internal Notes'],
    });
  }
  log.push(['Purchase orders', `${P.length.toLocaleString()} POs built; PO totals converted to AED, 5% VAT detected on AED POs, carded value compared with PO value`]);
  if (billsByPo) log.push(['Payments', `${bills.length.toLocaleString()} vendor bills against ${billsByPo.size.toLocaleString()} POs - paid and balance per PO come from the bills`]);

  // ================================================================ landed-cost split (NetSuite sync only)
  // IBV landed-cost lines -> { cats, byIbv: { 'IBV-03236': [AED per cat] } }. A car's posted landed cost is later
  // split in its IBV's proportions, so the split always adds up to the landed cost shown elsewhere.
  let LC = null;
  if (Array.isArray(landed) && landed.length) {
    const label = (c) => String(c ?? 'Uncategorised').replace(/^Landed Cost\s*-\s*/i, '').trim() || 'Uncategorised';
    const tot = new Map();
    for (const l of landed) { const c = label(l.cat); tot.set(c, (tot.get(c) || 0) + (toNum(l.aed) || 0)); }
    const cats = [...tot.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    const ci = new Map(cats.map((c, i) => [c, i]));
    const byIbv = {};
    for (const l of landed) {
      const amt = toNum(l.aed);
      if (!l.ibv || !amt) continue;
      const a = byIbv[l.ibv] || (byIbv[l.ibv] = cats.map(() => 0));
      a[ci.get(label(l.cat))] += amt;
    }
    for (const k of Object.keys(byIbv)) byIbv[k] = byIbv[k].map((x) => Math.round(x * 100) / 100);
    LC = { cats, byIbv };
    log.push(['Landed cost split', `${landed.length.toLocaleString()} IBV landed-cost lines in ${cats.length} categories (${cats.join(', ')}) across ${Object.keys(byIbv).length.toLocaleString()} IBVs`]);
  }

  // ================================================================ validation report
  const inStock = V.filter((v) => v.inStock);
  const locUnmapped = new Map();
  for (const v of V) if (!LOCATION_MAP[v.loc]) locUnmapped.set(v.loc ?? '(blank)', (locUnmapped.get(v.loc ?? '(blank)') || 0) + 1);
  const repMap = new Map();
  for (const v of V) {
    if (!v.rep) continue;
    if (!repMap.has(v.rep)) repMap.set(v.rep, { name: v.rep, codes: new Set(), units: 0 });
    const e = repMap.get(v.rep); e.units++; if (v.repCode) e.codes.add(v.repCode);
  }
  const repTable = [...repMap.values()].map((e) => ({ name: e.name, codes: [...e.codes].sort(), units: e.units }))
    .sort((a, b) => b.units - a.units);
  const destTable = [...destMap.values()].map((e) => ({
    country: e.country, type: e.type, units: e.units,
    spellings: [...e.spellings.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]),
  })).sort((a, b) => b.units - a.units);
  const FYS = S.filter((s) => s.created != null && new Date(s.created * DAY).getUTCFullYear() === FY);
  const pctFilled = (arr, f) => ({ filled: arr.filter(f).length, total: arr.length });
  const fyImports = V.filter((v) => v.route === 'Import (overseas vendor)' && v.poDate != null && new Date(v.poDate * DAY).getUTCFullYear() === FY);
  const posted = fyImports.filter((v) => v.lcs === 'Posted').length;
  const notPosted = fyImports.filter((v) => v.lcs === 'Not posted - import').length;
  if (tcBad) warnings.push(`${tcBad} row(s) where Total Cost differs from Purchase + Landed Cost.`);

  const validation = {
    accepted: true, errors, warnings,
    columns: { expected: EXPECTED_COLUMNS.length, found: EXPECTED_COLUMNS.length - missing.length, missing, extra },
    rows: { read: rows.length, loaded: N, skippedNoId, duplicateIds: dupIds, skipped: skippedNoId + dupIds },
    totalCost: { checked: tcChecked, mismatches: tcBad, examples: tcExamples },
    cards: {
      multiChassis, cardsInChains, afterSales: stageCounts['Excluded - after-sales card'] || 0, nonVehicle: nonVeh,
      capitalized: stageCounts['Excluded - capitalized asset'] || 0, transferred: stageCounts['Closed - transferred to other entity'] || 0,
      salesReturned: stageCounts['Closed - sales return (re-carded)'] || 0, purchaseReturned: stageCounts['Closed - returned to supplier'] || 0,
      statusConflicts: stageCounts['Check - shipped but status open'] || 0,
    },
    vin: { junkCleaned: junkChars, ioqFixed: ioq, invalid: invalidVin, examples: vinExamples, invalidExamples },
    locations: { total: new Set(V.map((v) => v.loc)).size, unmapped: [...locUnmapped.entries()].map(([location, units]) => ({ location, units })),
      pendingReceivingInStock: inStock.filter((v) => v.locType === 'Pending Receiving').length },
    destinations: { fromOutbound: fromOut, fromVst, neither, rawSpellings: destTable.reduce((a, d) => a + d.spellings.length, 0),
      reported: destTable.length, table: destTable },
    reps: { table: repTable, merged: repTable.filter((r) => r.codes.length > 1).length },
    shipments: {
      focusYear: FY, total: FYS.length,
      fields: [
        ['ETA', pctFilled(FYS, (s) => s.eta != null)], ['Actual arrival (ATA)', pctFilled(FYS, (s) => s.ata != null)],
        ['Bill of lading', pctFilled(FYS, (s) => s.bl != null)], ['Vessel', pctFilled(FYS, (s) => s.vessel != null)],
        ['Port of loading', pctFilled(FYS, (s) => s.pol != null)], ['Port of discharge', pctFilled(FYS, (s) => s.pod != null)],
        ['Containers', pctFilled(FYS, (s) => s.containers != null)], ['Receiving date', pctFilled(FYS, (s) => s.recv != null || s.status === 'In transit')],
      ].map(([field, x]) => ({ field, ...x })),
      copied: S.filter((s) => s.copied).length,
      withAllThree: S.filter((s) => s.etd != null && s.atd != null && s.eta != null && s.etaSource === 'Field').length,
      openNoFutureEta: S.filter((s) => s.status === 'In transit' && s.stage !== 'In transit - ETA ahead').length,
      open: S.filter((s) => s.status === 'In transit').length,
    },
    landed: { focusYear: FY, importsReceivedPosted: posted, importsNotPosted: notPosted, coverage: posted + notPosted ? posted / (posted + notPosted) : null,
      inStockImportsNoLanded: inStock.filter((v) => v.lcs === 'Not posted - import').length },
    ageing: { inStock: inStock.length, estimated: ageEstimated },
    stages: stageCounts,
    dates: { min: isFinite(dMin) ? dMin : null, max: isFinite(dMax) ? dMax : null, asOf },
    log,
  };

  const meta = {
    version: PIPELINE_VERSION, builtAt: new Date(opts.now ?? Date.now()).toISOString(), ms: Date.now() - t0,
    asOf, focusYear: FY, rowsRead: rows.length, unitsLoaded: N, rowsSkipped: skippedNoId + dupIds,
    dateMin: validation.dates.min, dateMax: validation.dates.max,
    ...(opts.meta || {}),
  };
  return { meta, V, S, P, validation, LC };
}
