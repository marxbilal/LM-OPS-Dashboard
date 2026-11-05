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

/** A car's posted landed cost split in its IBV's proportions: AED per LC.cats entry, or null when its IBV has no lines. */
export function lcSplit(v, LC) {
  const mix = LC && v.lc > 0 && v.ibv ? LC.byIbv[v.ibv] : null;
  if (!mix) return null;
  const tot = mix.reduce((a, x) => a + x, 0);
  return tot > 0 ? mix.map((x) => (v.lc * x) / tot) : null;
}
