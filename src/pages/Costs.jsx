import { useMemo } from 'react';
import { useData } from '../context.js';
import { useChartTheme } from '../theme.js';
import { useFilters, ymMatch, ymRange, match, pick, applyPreds, kpiClick, kpiPred, sum, avg, options } from '../data/metrics.js';
import FilterBar from '../components/FilterBar.jsx';
import EChart from '../components/EChart.jsx';
import DataTable from '../components/DataTable.jsx';
import { hBars, lines, rowsHeight } from '../components/charts.js';
import { Kpi, ChartCard, Banner, Card } from '../components/ui.jsx';
import { PageHead, timeAxis, clampRange } from './common.jsx';
import { int, aed, aedFull, pct, dec, compact, date, monthKey, monthLabel, yearOf } from '../format.js';
import { saveFile, toCSV } from '../components/download.js';
import { IMPORT, LCS, groupModels } from '../data/landed.js';
import LandedMix, { lcCatPred } from '../components/LandedMix.jsx';

// KPI cards that stand for a subset of cars: clicking one filters the page to it
const KPI_CARDS = {
  posted: { label: 'Imported cars with landed cost posted', test: (v) => v.route === IMPORT && v.lcs === 'Posted' },
  importsReceived: { label: 'Received imported cars', test: (v) => v.route === IMPORT && (v.lcs === 'Posted' || v.lcs === 'Not posted - import') },
};

export default function Costs() {
  const { ds } = useData();
  const t = useChartTheme();
  const { V, meta, LC } = ds;
  const asOf = meta.asOf;
  // poM (PO month) is a chart-click selection (no dropdown)
  const defaults = { period: [String(yearOf(asOf))], brand: [], model: [], route: [], vendor: [], lcs: [], poM: [], kpi: [], noLanded: [], lcCat: [] }; // noLanded: set by the banner; lcCat: cost type picked on the chart
  const [f, set, reset, toggle] = useFilters(defaults);
  const setF = (id, v) => { set(id, v); if (id === 'period') set('poM', []); }; // a picked month may fall outside the new period
  const onPO = useMemo(() => V.filter((v) => v.veh && v.po && v.poDate != null), [V]);
  const opts = useMemo(() => ({
    brand: options(onPO, (v) => v.brand), model: options(onPO.filter((v) => match(v.brand, f.brand)), (v) => v.model),
    route: [IMPORT, 'Local (UAE vendor)'], vendor: options(onPO, (v) => v.vendor), lcs: LCS,
    years: [...new Set([yearOf(asOf), ...onPO.map((v) => yearOf(v.poDate)).filter((y) => y != null)])].sort((a, b) => b - a),
  }), [onPO, f.brand, asOf]);
  const range = ymRange(f.period); // span of the picked years/months, for the chart axis
  const preds = {
    brand: pick(f.brand, (v) => v.brand), model: pick(f.model, (v) => v.model ?? 'Unknown'), route: pick(f.route, (v) => v.route),
    vendor: pick(f.vendor, (v) => v.vendor), lcs: pick(f.lcs, (v) => v.lcs), poM: pick(f.poM, (v) => monthKey(v.poDate)), kpi: kpiPred(f, KPI_CARDS),
    noLanded: f.noLanded.length ? (v) => v.lcs === 'Not posted - import' : null,
    lcCat: lcCatPred(f.lcCat, LC),
  };
  // cars on POs dated in the period, every selection applied except `skip` (a chart's own dimension)
  const carsOf = (skip) => applyPreds(onPO.filter((v) => ymMatch(v.poDate, f.period)), preds, skip);
  const carsAll = useMemo(() => carsOf(['lcs', 'noLanded']), [onPO, f, range.from, range.to]);
  const cars = useMemo(() => carsOf(), [onPO, f, range.from, range.to]);
  const mixCars = useMemo(() => carsOf('lcCat'), [onPO, f, range.from, range.to]);

  const k = useMemo(() => {
    const imp = cars.filter((v) => v.route === IMPORT);
    const posted = imp.filter((v) => v.lcs === 'Posted');
    const notPosted = imp.filter((v) => v.lcs === 'Not posted - import');
    return {
      n: cars.length, imports: imp.length, local: cars.length - imp.length, value: sum(cars, (v) => v.pp), avgPP: avg(cars, (v) => v.pp),
      avgLC: avg(posted, (v) => v.lc), lcShare: sum(posted, (v) => v.pp) ? sum(posted, (v) => v.lc) / sum(posted, (v) => v.pp) : null,
      coverage: posted.length + notPosted.length ? posted.length / (posted.length + notPosted.length) : null,
      notPosted: notPosted.length, landedTotal: sum(cars, (v) => v.lc),
    };
  }, [cars]);
  const notPostedAll = useMemo(() => carsAll.filter((v) => v.lcs === 'Not posted - import').length, [carsAll]);

  // per-model costs: the table follows every selection, the two model charts skip the model pick
  const models = useMemo(() => groupModels(cars), [cars]);
  const chartModels = useMemo(() => groupModels(carsOf('model')), [onPO, f, range.from, range.to]);
  const keepPicked = (rows, n) => [...rows.slice(0, n), ...rows.slice(n).filter((m) => f.model.includes(m.key))];
  const top = keepPicked(chartModels, 15);
  const costOpt = useMemo(() => hBars(t, top.map((m) => m.key), [
    { name: 'Avg purchase cost', data: top.map((m) => Math.round(m.avgPP)), color: t.s1 },
    { name: 'Avg landed cost (where posted)', data: top.map((m) => Math.round(m.avgLC || 0)), color: t.s2 },
  ], { stacked: true, fmt: (v) => int(v), catWidth: 150, selected: f.model, tipExtra: (i) => [{ name: 'Cars', value: int(top[i].n) }, { name: 'Landed cost posted on', value: pct(top[i].posted, 0) }], tipFoot: (i) => top[i].brand }), [t, chartModels, f.model]);

  const lcModels = useMemo(() => keepPicked(chartModels.filter((m) => m.lcN >= 5).sort((a, b) => b.lcPct - a.lcPct), 15), [chartModels, f.model]);
  const lcOpt = useMemo(() => hBars(t, lcModels.map((m) => m.key), [{ name: 'Landed cost as % of purchase', data: lcModels.map((m) => Math.round(m.lcPct * 1000) / 10), color: t.s2 }],
    { fmt: (v) => `${dec(v, 1)}%`, axisFmt: (v) => `${v}%`, catWidth: 150, selected: f.model, tipExtra: (i) => [{ name: 'Avg landed cost', value: aedFull(lcModels[i].avgLC) }, { name: 'Cars with landed cost', value: int(lcModels[i].lcN) }] }), [t, lcModels, f.model]);

  // posting coverage by PO month (imports received) - about landed cost, so the landed-cost pick doesn't apply
  const cov = useMemo(() => {
    const imp = carsOf(['poM', 'lcs', 'noLanded']).filter((v) => v.route === IMPORT && (v.lcs === 'Posted' || v.lcs === 'Not posted - import'));
    const r = clampRange(range, imp, (v) => v.poDate, asOf);
    const ax = timeAxis(r.from, r.to, 'month');
    const idx = new Map(ax.keys.map((x, i) => [x, i]));
    const p = ax.keys.map(() => 0), n = ax.keys.map(() => 0);
    for (const v of imp) { const i = idx.get(ax.keyOf(v.poDate)); if (i == null) continue; n[i]++; if (v.lcs === 'Posted') p[i]++; }
    return { ax, p, n, share: n.map((x, i) => (x ? Math.round((p[i] / x) * 1000) / 10 : null)) };
  }, [onPO, f, range.from, range.to, asOf]);
  const covOpt = useMemo(() => lines(t, cov.ax.keys, [{ name: 'Imported cars with landed cost posted', data: cov.share, color: t.s1 }],
    { xFmt: cov.ax.label, selected: f.poM, fmt: (v) => (v == null ? '-' : `${dec(v, 0)}%`), axisFmt: (v) => `${v}%`, yMin: 0 }), [t, cov, f.poM]);

  const status = useMemo(() => LCS.map((s) => [s, carsAll.filter((v) => v.lcs === s).length]), [carsAll]);
  const statusOpt = useMemo(() => hBars(t, status.map((s) => s[0]), [{ name: 'Cars', data: status.map((s) => s[1]), color: t.s1 }],
    { catWidth: 170, selected: f.noLanded.length ? [...f.lcs, 'Not posted - import'] : f.lcs, endText: (i) => `${int(status[i][1])} (${pct(carsAll.length ? status[i][1] / carsAll.length : 0, 0)})` }), [t, status, carsAll, f.lcs, f.noLanded]);

  const modelCols = [
    { key: 'brand', label: 'Brand' }, { key: 'key', label: 'Model' }, { key: 'n', label: 'Cars', align: 'r', fmt: int },
    { key: 'avgPP', label: 'Avg purchase (AED)', align: 'r', fmt: int }, { key: 'avgLC', label: 'Avg landed (AED)', align: 'r', fmt: (v) => (v == null ? '-' : int(v)) },
    { key: 'lcPct', label: 'Landed %', align: 'r', fmt: (v) => pct(v), csv: (r) => (r.lcPct == null ? '' : (r.lcPct * 100).toFixed(1)) },
    { key: 'avgTotal', label: 'Avg total (AED)', align: 'r', fmt: int }, { key: 'posted', label: 'Landed cost posted', align: 'r', fmt: (v) => pct(v, 0), csv: (r) => (r.posted * 100).toFixed(0) },
    { key: 'pp', label: 'Purchase value (AED)', align: 'r', fmt: int },
  ];
  const downloadCars = () => saveFile('cost-by-car.csv', toCSV([
    { key: 'ch', label: 'Chassis' }, { key: 'id', label: 'Internal ID' }, { key: 'brand', label: 'Brand' }, { key: 'model', label: 'Model' },
    { key: 'po', label: 'PO #' }, { key: 'poDate', label: 'PO date', csv: (r) => date(r.poDate) }, { key: 'vendor', label: 'Vendor' },
    { key: 'route', label: 'Supply route' }, { key: 'pp', label: 'Purchase cost (AED)' }, { key: 'lc', label: 'Landed cost (AED)' },
    { key: 'tc', label: 'Total cost (AED)' }, { key: 'lcs', label: 'Landed cost status' }, { key: 'stage', label: 'Stage' },
  ], cars));

  return (
    <>
      <PageHead title="Costs" sub="What each model costs us: purchase price plus landed cost (freight, transport and clearance), exactly as posted in NetSuite." />
      <FilterBar asOf={asOf} values={f} set={setF} reset={reset} defaults={defaults} filters={[
        { id: 'period', label: 'PO date', type: 'yearmonth', years: opts.years },
        { id: 'brand', label: 'Brand', options: opts.brand },
        { id: 'model', label: 'Model', options: opts.model },
        { id: 'route', label: 'Supply route', options: opts.route },
        { id: 'vendor', label: 'Vendor', options: opts.vendor },
        { id: 'lcs', label: 'Landed cost', options: opts.lcs },
      ]} picks={[{ id: 'poM', label: 'PO month', fmt: monthLabel }, { id: 'kpi', label: 'Card', fmt: (id) => KPI_CARDS[id]?.label ?? id }, { id: 'noLanded', label: 'Showing' }, { id: 'lcCat', label: 'Cost type' }]} />
      <div className="kpis">
        <Kpi {...kpiClick(f, set, null)} label="Cars on these POs" value={int(k.n)} sub={`${int(k.imports)} imported · ${int(k.local)} local`} />
        <Kpi {...kpiClick(f, set, null)} label="Purchase value" value={aed(k.value)} sub={aedFull(k.value)} tone="money" />
        <Kpi {...kpiClick(f, set, null)} label="Avg purchase cost" value={aed(k.avgPP)} sub="Per car, AED" tone="money" />
        <Kpi {...kpiClick(f, set, 'posted')} label="Avg landed cost, imports" value={aed(k.avgLC)} sub="Per imported car where posted" tone="money" />
        <Kpi {...kpiClick(f, set, 'posted')} label="Landed as % of purchase" value={pct(k.lcShare)} sub="Imported cars with landed cost posted" />
        <Kpi {...kpiClick(f, set, 'importsReceived')} label="Landed cost posted" value={pct(k.coverage, 0)} sub={`${int(k.notPosted)} received imports still without it`} />
      </div>
      {notPostedAll > 0 && !f.lcs.includes('Not posted - import') && !f.noLanded.length && (
        <Banner tone="accent" title="Some imported cars carry no landed cost" onClick={() => set('noLanded', ['Imported cars without landed cost'])}>
          {int(notPostedAll)} received imported cars on these POs have no landed cost posted, so their cost is purchase price only. Averages above use posted landed cost only; nothing is estimated. Click to show just these cars.
        </Banner>
      )}
      <div className="grid-2">
        <ChartCard title="Cost per car by model" sub={`Top ${top.length} models by cars on POs · purchase + average posted landed cost`}
          legend={[{ name: 'Avg purchase cost', color: t.s1 }, { name: 'Avg landed cost (where posted)', color: t.s2 }]}
          table={{ columns: modelCols, rows: models, csvName: 'cost-by-model' }}>
          <EChart option={costOpt} height={rowsHeight(top.length, 28)} label="Cost per car by model" onPick={(i) => toggle('model', top[i].key)} />
        </ChartCard>
        <ChartCard title="Landed cost as a share of purchase" sub="Models with landed cost posted on 5 or more cars"
          table={{ columns: modelCols, rows: lcModels, csvName: 'landed-share-by-model', search: false }}>
          <EChart option={lcOpt} height={rowsHeight(lcModels.length, 28)} label="Landed cost as a share of purchase by model" onPick={(i) => toggle('model', lcModels[i].key)} />
        </ChartCard>
      </div>
      <div className="grid-2">
        <ChartCard title="Landed cost status" sub="Every car on POs in the period"
          table={{ columns: [{ key: 's', label: 'Landed cost status' }, { key: 'n', label: 'Cars', align: 'r', fmt: int }], rows: status.map(([s, n]) => ({ s, n, __key: s })), search: false }}>
          <EChart option={statusOpt} height={rowsHeight(status.length, 40)} label="Cars by landed cost status" onPick={(i) => toggle('lcs', status[i][0])} />
        </ChartCard>
        <LandedMix cars={mixCars} LC={LC} selected={f.lcCat} onPick={(c) => toggle('lcCat', c)} what="cars on these POs" />
      </div>
      <ChartCard title="Landed cost posting by PO month" sub="Share of received imported cars with landed cost posted"
        table={{ columns: [{ key: 'm', label: 'PO month' }, { key: 'n', label: 'Imported cars received', align: 'r', fmt: int }, { key: 'p', label: 'With landed cost', align: 'r', fmt: int }, { key: 's', label: 'Share', align: 'r', fmt: (v) => (v == null ? '-' : `${dec(v, 1)}%`), total: (rows) => { const n = sum(rows, (r) => r.n); return n ? `${dec((sum(rows, (r) => r.p) / n) * 100, 1)}%` : '-'; } }],
          rows: cov.ax.keys.map((key, i) => ({ __key: key, m: cov.ax.label(key), n: cov.n[i], p: cov.p[i], s: cov.share[i] })), search: false }}>
        <EChart option={covOpt} height={260} label="Landed cost posting by PO month" onPick={(i) => toggle('poM', cov.ax.keys[i])} />
      </ChartCard>
      <Card title="Cost by model" sub="Landed cost per car is shown as one total - see Landed cost distribution above for what it is made of."
        tools={<button type="button" className="btn" onClick={downloadCars}>Download cars (CSV)</button>}>
        <DataTable columns={modelCols} rows={models} csvName="cost-by-model" totals={(rows) => ({
          key: `${int(rows.length)} models`, n: int(sum(rows, (r) => r.n)), pp: int(sum(rows, (r) => r.pp)),
          avgPP: int(sum(rows, (r) => r.pp) / Math.max(1, sum(rows, (r) => r.n))),
        })} />
      </Card>
    </>
  );
}
