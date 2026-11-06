// "Cost per car by model" and "Landed cost as a share of purchase" for a set of cars (received on Inbound,
// dispatched on Outbound). Returns the two chart cards; the page puts them in a grid row.
import { useMemo } from 'react';
import { useChartTheme } from '../theme.js';
import EChart from './EChart.jsx';
import { hBars, rowsHeight } from './charts.js';
import { ChartCard } from './ui.jsx';
import { int, aedFull, pct, dec } from '../format.js';
import { groupModels } from '../data/landed.js';

/**
 * cars: the cars to cost (each chart ignores the page's own model pick, so pass cars without it);
 * selected: picked models; onPick(model); what: how the cars are described, e.g. "cars received".
 */
export default function ModelCost({ cars, selected = [], onPick, what = 'cars', csvPrefix = 'model' }) {
  const t = useChartTheme();
  const models = useMemo(() => groupModels(cars), [cars]);
  // top 15 on each chart, plus any picked model further down
  const keep = (rows, n) => [...rows.slice(0, n), ...rows.slice(n).filter((m) => selected.includes(m.key))];
  const top = useMemo(() => keep(models, 15), [models, selected]);
  const lcModels = useMemo(() => keep(models.filter((m) => m.lcN >= 5).sort((a, b) => b.lcPct - a.lcPct), 15), [models, selected]);
  const nLabel = what.charAt(0).toUpperCase() + what.slice(1);
  const costOpt = useMemo(() => hBars(t, top.map((m) => m.key), [
    { name: 'Avg purchase cost', data: top.map((m) => Math.round(m.avgPP)), color: t.s1 },
    { name: 'Avg landed cost (where posted)', data: top.map((m) => Math.round(m.avgLC || 0)), color: t.s2 },
  ], {
    stacked: true, fmt: (v) => int(v), catWidth: 150, selected,
    tipExtra: (i) => [{ name: nLabel, value: int(top[i].n) }, { name: 'Landed cost posted on', value: pct(top[i].posted, 0) }], tipFoot: (i) => top[i].brand,
  }), [t, top, selected, nLabel]);
  const lcOpt = useMemo(() => hBars(t, lcModels.map((m) => m.key), [{ name: 'Landed cost as % of purchase', data: lcModels.map((m) => Math.round(m.lcPct * 1000) / 10), color: t.s2 }], {
    fmt: (v) => `${dec(v, 1)}%`, axisFmt: (v) => `${v}%`, catWidth: 150, selected,
    tipExtra: (i) => [{ name: 'Avg landed cost', value: aedFull(lcModels[i].avgLC) }, { name: 'Cars with landed cost', value: int(lcModels[i].lcN) }],
  }), [t, lcModels, selected]);
  const cols = [
    { key: 'brand', label: 'Brand' }, { key: 'key', label: 'Model' }, { key: 'n', label: nLabel, align: 'r', fmt: int },
    { key: 'avgPP', label: 'Avg purchase (AED)', align: 'r', fmt: int }, { key: 'avgLC', label: 'Avg landed (AED)', align: 'r', fmt: (v) => (v == null ? '-' : int(v)) },
    { key: 'lcPct', label: 'Landed %', align: 'r', fmt: (v) => pct(v), csv: (r) => (r.lcPct == null ? '' : (r.lcPct * 100).toFixed(1)) },
    { key: 'avgTotal', label: 'Avg total (AED)', align: 'r', fmt: int },
    { key: 'posted', label: 'Landed cost posted', align: 'r', fmt: (v) => pct(v, 0), csv: (r) => (r.posted * 100).toFixed(0) },
  ];
  const none = <p className="muted" style={{ padding: 12 }}>No cars for these filters.</p>;
  return (
    <>
      <ChartCard title="Cost per car by model" sub={`Top ${top.length} models by ${what} · purchase + average posted landed cost`}
        legend={[{ name: 'Avg purchase cost', color: t.s1 }, { name: 'Avg landed cost (where posted)', color: t.s2 }]}
        table={{ columns: cols, rows: models, csvName: `${csvPrefix}-cost-by-model` }}>
        {top.length ? <EChart option={costOpt} height={rowsHeight(top.length, 28)} label={`Cost per car by model (${what})`} onPick={(i) => onPick(top[i].key)} /> : none}
      </ChartCard>
      <ChartCard title="Landed cost as a share of purchase" sub={`Models with landed cost posted on 5 or more ${what}`}
        table={{ columns: cols, rows: lcModels, csvName: `${csvPrefix}-landed-share`, search: false }}>
        {lcModels.length ? <EChart option={lcOpt} height={rowsHeight(lcModels.length, 28)} label={`Landed cost as a share of purchase by model (${what})`} onPick={(i) => onPick(lcModels[i].key)} />
          : <p className="muted" style={{ padding: 12 }}>No model has landed cost posted on 5 or more {what} for these filters.</p>}
      </ChartCard>
    </>
  );
}
