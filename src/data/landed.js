// Landed-cost rules shared by the Costs and Outbound pages.
export const IMPORT = 'Import (overseas vendor)';
export const LCS = ['Posted', 'Pending (in transit)', 'Not posted - import', 'Not posted - local purchase'];

/** Per-model purchase and posted landed cost, most cars first. Landed cost averages use posted cars only. */
export function groupModels(cars) {
  const m = new Map();
  for (const v of cars) {
    const key = v.model ?? 'Unknown';
    let e = m.get(key);
    if (!e) { e = { key, brand: v.brand, n: 0, pp: 0, lcN: 0, lc: 0, lcPP: 0, imp: 0 }; m.set(key, e); }
    e.n++; e.pp += v.pp || 0;
    if (v.route === IMPORT) e.imp++;
    if (v.lcs === 'Posted') { e.lcN++; e.lc += v.lc; e.lcPP += v.pp || 0; }
  }
  return [...m.values()].map((e) => ({
    ...e, __key: e.key, avgPP: e.pp / e.n, avgLC: e.lcN ? e.lc / e.lcN : null, lcPct: e.lcPP ? e.lc / e.lcPP : null,
    avgTotal: e.pp / e.n + (e.lcN ? e.lc / e.lcN : 0), posted: e.lcN / e.n,
  })).sort((a, b) => b.n - a.n);
}

export const NOT_ITEMISED = 'Not itemised';

/**
 * A car's posted landed cost split by cost type: AED per LC.cats entry, or null when nothing itemises it.
 * Uses the car's own lines from the landed cost sheet (v.lcMix) when there are any, else its IBV's proportions.
 * Either way the parts add up to the landed cost on the card.
 */
export function lcSplit(v, LC) {
  if (!LC || !(v.lc > 0)) return null;
  let mix = null;
  if (v.lcMix) { mix = LC.cats.map(() => 0); for (let i = 0; i < v.lcMix.length; i += 2) mix[v.lcMix[i]] += v.lcMix[i + 1]; }
  else if (v.ibv) mix = LC.byIbv[v.ibv];
  if (!mix) return null;
  const tot = mix.reduce((a, x) => a + x, 0);
  return tot > 0 ? mix.map((x) => (v.lc * x) / tot) : null;
}

/** "Landed Cost-Clearing|IBV-03253" / "Landed Cost -Port Handling" -> "Clearing" / "Port Handling" (same names as NetSuite's IBV lines). */
export function lcCatLabel(s) {
  const x = String(s ?? '').split('|')[0].replace(/^\s*Landed Cost\s*-\s*/i, '').replace(/\bIBV-\d+\b/gi, '').trim();
  if (!x || /accrual/i.test(x)) return 'Other Charges';
  return x.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

const USD_AED = 3.6725; // the dirham's fixed peg

/**
 * The landed cost sheet (one row per landed-cost journal line: Vehicle Card "STK<internal id>", Chassis Number,
 * Currency, Memo "Landed Cost-<type>|<IBV>", Amount) -> per card, AED per cost type:
 * { fileName, lines, skipped, cats: [type], cards: [[internalId, catIndex, aed, catIndex, aed, ...]] }.
 */
export function parseLandedSheet(aoa, fileName) {
  const head = (aoa[0] || []).map((h) => String(h ?? '').trim().toLowerCase());
  const col = (name) => head.findIndex((h) => h.startsWith(name));
  const iCard = col('vehicle card'), iCcy = col('currency'), iMemo = col('memo'), iAmt = col('amount');
  if (iCard < 0 || iMemo < 0 || iAmt < 0) throw new Error('The landed cost sheet needs the columns Vehicle Card, Memo and Amount (Debit).');
  const cats = [], ci = new Map(), cards = new Map();
  let lines = 0, skipped = 0;
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row || !row.length) continue;
    const id = Number(String(row[iCard] ?? '').trim().replace(/^STK/i, ''));
    let amt = typeof row[iAmt] === 'number' ? row[iAmt] : Number(String(row[iAmt] ?? '').replace(/,/g, ''));
    if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(amt) || amt === 0) { skipped++; continue; }
    if (iCcy >= 0 && String(row[iCcy] ?? '').trim().toUpperCase() === 'USD') amt *= USD_AED;
    const c = lcCatLabel(row[iMemo]);
    if (!ci.has(c)) { ci.set(c, cats.length); cats.push(c); }
    let e = cards.get(id);
    if (!e) { e = new Map(); cards.set(id, e); }
    e.set(ci.get(c), (e.get(ci.get(c)) || 0) + amt);
    lines++;
  }
  if (!lines) throw new Error('No landed-cost lines with a vehicle card and an amount were found in the sheet.');
  return {
    fileName, lines, skipped, cats,
    cards: [...cards].map(([id, e]) => [id, ...[...e].flatMap(([k, v]) => [k, Math.round(v * 100) / 100])]),
  };
}
