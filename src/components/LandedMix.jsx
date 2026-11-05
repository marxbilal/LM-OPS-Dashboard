// "Landed cost distribution": the posted landed cost of the given cars, split by cost type
// (ocean freight, clearing, customs duty...) in each car's IBV landed-cost proportions. Used on Outbound and Costs.
import { useMemo } from 'react';
import { useChartTheme } from '../theme.js';
import EChart from './EChart.jsx';
import { hBars, rowsHeight } from './charts.js';
import { ChartCard } from './ui.jsx';
import { int, aed, aedFull, pct } from '../format.js';
import { NOT_ITEMISED, lcSplit } from '../data/landed.js';

/** Totals per cost type for these cars, biggest first; null when the dataset has no split (not synced from NetSuite). */
export function landedMix(cars, LC) {
  if (!LC) return null;
  const amt = LC.cats.map(() => 0);
  let none = 0, n = 0;
  for (const v of cars) {
    if (!(v.lc > 0)) continue;
    n++;
    const sp = lcSplit(v, LC);
    if (sp) sp.forEach((x, i) => { amt[i] += x; }); else none += v.lc;
  }
  const rows = LC.cats.map((c, i) => ({ c, v: amt[i] })).filter((r) => r.v > 0).sort((a, b) => b.v - a.v);
  if (none > 0) rows.push({ c: NOT_ITEMISED, v: none });
  return { rows, cars: n, total: rows.reduce((a, r) => a + r.v, 0) };
}

/** Predicate for picked cost types: cars whose landed cost includes one (or, for "Not itemised", has no IBV lines). */
export const lcCatPred = (sel, LC) => (sel?.length && LC ? (v) => {
  const sp = lcSplit(v, LC);
  return sel.some((c) => (c === NOT_ITEMISED ? v.lc > 0 && !sp : sp?.[LC.cats.indexOf(c)] > 0));
} : null);

export default function LandedMix({ cars, LC, selected, onPick, what = 'cars' }) {
  const t = useChartTheme();
  const mix = useMemo(() => landedMix(cars, LC), [cars, LC]);
  const share = (x) => (mix.total ? x / mix.total : 0);
  const opt = useMemo(() => mix && hBars(t, mix.rows.map((r) => r.c), [{ name: 'Landed cost (AED)', data: mix.rows.map((r) => Math.round(r.v)), color: t.s2 }], {
    catWidth: 160, fmt: (v) => aedFull(v), selected,
    endText: (i) => `${aed(mix.rows[i].v)} (${pct(share(mix.rows[i].v), 0)})`,
    tipExtra: (i) => [{ name: 'Share of landed cost', value: pct(share(mix.rows[i].v), 1) }],
    tipFoot: (i) => (mix.rows[i].c === NOT_ITEMISED ? 'Landed cost posted on the car but no landed-cost lines on its IBV' : null),
  }), [t, mix, selected]);
  return (
    <ChartCard title="Landed cost distribution"
      sub={mix ? `Posted landed cost of ${int(mix.cars)} ${what} · ${aed(mix.total)} · split by the IBV landed-cost lines in NetSuite` : 'Split by the IBV landed-cost lines in NetSuite'}
      table={mix ? {
        columns: [{ key: 'c', label: 'Cost type' }, { key: 'v', label: 'Landed cost (AED)', align: 'r', fmt: int },
          { key: 's', label: 'Share', align: 'r', fmt: (x) => pct(x, 1), csv: (r) => (r.s * 100).toFixed(1) }],
        rows: mix.rows.map((r) => ({ ...r, s: share(r.v), __key: r.c })), search: false, csvName: 'landed-cost-mix',
      } : undefined}>
      {!mix ? <p className="muted" style={{ padding: 12 }}>The split comes from NetSuite Data Sync (an export file doesn't carry it) - run the sync on Upload Data to see it.</p>
        : mix.rows.length ? <EChart option={opt} height={rowsHeight(mix.rows.length, 34)} label="Landed cost by cost type" onPick={(i) => onPick(mix.rows[i].c)} />
          : <p className="muted" style={{ padding: 12 }}>No landed cost posted on these cars for these filters.</p>}
    </ChartCard>
  );
}
