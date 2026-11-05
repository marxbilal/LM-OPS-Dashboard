import { useMemo } from 'react';
import { useData } from '../context.js';
import { useChartTheme } from '../theme.js';
import { useFilters, match, pick, applyPreds, kpiClick, kpiPred, sum, avg, options } from '../data/metrics.js';
import FilterBar from '../components/FilterBar.jsx';
import EChart from '../components/EChart.jsx';
import DataTable from '../components/DataTable.jsx';
import { hBars, columns, lines, rowsHeight } from '../components/charts.js';
import { Kpi, ChartCard, Banner, Card, Chip } from '../components/ui.jsx';
import { PageHead, dayLabel } from './common.jsx';
import { int, aed, aedFull, pct, date, dec, compact, monthEnd, addMonths, monthKey, monthLabel } from '../format.js';
import { COMMERCIAL } from '../data/pipeline.js';

const B4 = ['0-30', '31-60', '61-90', '90+'];
const B6 = ['0-30', '31-60', '61-90', '91-180', '181-365', '365+'];
const COMM_SHORT = { Unreserved: 'Unreserved', 'Reserved (not fully paid)': 'Reserved', 'Paid - awaiting delivery': 'Paid, awaiting delivery', 'On hold': 'On hold' };

function median(arr) {
  const a = arr.filter((x) => x != null).sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : null;
}

// KPI cards that stand for a subset of stock: clicking one filters the page to it
const KPI_CARDS = {
  aged: { label: 'Over 90 days in stock', test: (v) => v.bucket === '90+' },
  unreserved: { label: 'Unreserved', test: (v) => v.comm === 'Unreserved' },
  pending: { label: 'Location not updated', test: (v) => v.locType === 'Pending Receiving' },
};

export default function Inventory() {
  const { ds, openVehicle } = useData();
  const t = useChartTheme();
  const { V, meta } = ds;
  const asOf = meta.asOf;
  // age6 / site are chart-click selections (no dropdown)
  const defaults = { entity: [], locType: [], brand: [], model: [], comm: [], fuel: [], bucket: [], age6: [], site: [], kpi: [] };
  const [f, set, reset, toggle] = useFilters(defaults);
  const stockAll = useMemo(() => V.filter((v) => v.inStock), [V]);
  const opts = useMemo(() => ({
    entity: options(stockAll, (v) => v.entity, { sortBy: 'name' }), locType: options(stockAll, (v) => v.locType),
    brand: options(stockAll, (v) => v.brand), model: options(stockAll.filter((v) => match(v.brand, f.brand)), (v) => v.model),
    comm: COMMERCIAL.map((c) => ({ value: c, label: COMM_SHORT[c] })), fuel: options(stockAll, (v) => v.fuel), bucket: B4,
  }), [stockAll, f.brand]);
  const keep = (v) => match(v.entity, f.entity) && match(v.brand, f.brand) && match(v.model, f.model) && match(v.fuel, f.fuel);
  const preds = {
    entity: pick(f.entity, (v) => v.entity), locType: pick(f.locType, (v) => v.locType), brand: pick(f.brand, (v) => v.brand),
    model: pick(f.model, (v) => v.model ?? 'Unknown'), comm: pick(f.comm, (v) => v.comm), fuel: pick(f.fuel, (v) => v.fuel),
    bucket: pick(f.bucket, (v) => v.bucket), age6: pick(f.age6, (v) => v.bucket6), site: pick(f.site, (v) => v.site ?? 'Unknown'), kpi: kpiPred(f, KPI_CARDS),
  };
  // stock with every selection applied except `skip` (a chart's own dimension, so it can show the rest dimmed)
  const stockOf = (skip) => applyPreds(stockAll, preds, skip);
  const stock = useMemo(() => stockOf(), [stockAll, f]);
  const transit = useMemo(() => V.filter((v) => v.inTransit && keep(v)).length, [V, f]);

  const k = useMemo(() => {
    const aged = stock.filter((v) => v.bucket === '90+').length;
    return {
      n: stock.length, value: sum(stock, (v) => v.tc), days: avg(stock, (v) => v.days), med: median(stock.map((v) => v.days)),
      aged, agedShare: stock.length ? aged / stock.length : null, unreserved: stock.filter((v) => v.comm === 'Unreserved').length,
      pending: stock.filter((v) => v.locType === 'Pending Receiving').length,
      noLanded: stock.filter((v) => v.lcs === 'Not posted - import').length,
      estimated: stock.filter((v) => v.startBasis !== 'IBV date').length,
    };
  }, [stock]);

  // age x commercial status
  const ageRows = useMemo(() => stockOf('age6'), [stockAll, f]);
  const ageComm = useMemo(() => COMMERCIAL.map((c) => B6.map((b) => ageRows.filter((v) => v.bucket6 === b && v.comm === c).length)), [ageRows]);
  const ageOpt = useMemo(() => columns(t, B6, COMMERCIAL.map((c, i) => ({ name: COMM_SHORT[c], data: ageComm[i], color: t.series[i] })),
    { stacked: true, xFmt: (x) => `${x} d`, selected: f.age6, tipExtra: (i) => [{ name: 'Value', value: aed(sum(ageRows.filter((v) => v.bucket6 === B6[i]), (v) => v.tc)) }] }), [t, ageComm, ageRows, f.age6]);
  const ageTable = {
    columns: [{ key: 'b', label: 'Days in stock' }, ...COMMERCIAL.map((c, i) => ({ key: `c${i}`, label: COMM_SHORT[c], align: 'r', fmt: int })),
      { key: 'tot', label: 'Total', align: 'r', fmt: int }, { key: 'val', label: 'Value (AED)', align: 'r', fmt: int }],
    rows: B6.map((b, j) => ({ __key: b, b, ...Object.fromEntries(COMMERCIAL.map((c, i) => [`c${i}`, ageComm[i][j]])), tot: ageRows.filter((v) => v.bucket6 === b).length, val: sum(ageRows.filter((v) => v.bucket6 === b), (v) => v.tc) })),
    search: false, csvName: 'stock-by-age',
  };

  // by site and by model, stacked by age bucket (ordinal ramp)
  const bySite = useMemo(() => groupAge(stockOf('site'), (v) => v.site, (v) => v.locType), [stockAll, f]);
  const byModel = useMemo(() => groupAge(stockOf('model'), (v) => v.model, (v) => v.brand), [stockAll, f]);
  // picked rows stay on the chart even when they fall outside the top N
  const topOf = (rows, n, sel) => [...rows.slice(0, n), ...rows.slice(n).filter((r) => sel.includes(r.key))];
  const topSites = topOf(bySite, 15, f.site), topModels = topOf(byModel, 20, f.model);
  const ageSeries = (rows) => B4.map((b, i) => ({ name: `${b} days`, color: t.ordinal[i], data: rows.map((r) => r.b[b]) }));
  const siteOpt = useMemo(() => hBars(t, topSites.map((r) => r.key), ageSeries(topSites), { stacked: true, catWidth: 150, selected: f.site, tipFoot: (i) => topSites[i].sub, tipExtra: (i) => [{ name: 'Avg days in stock', value: dec(topSites[i].avgDays, 0) }] }), [t, bySite, f.site]);
  const modelOpt = useMemo(() => hBars(t, topModels.map((r) => r.key), ageSeries(topModels), { stacked: true, catWidth: 150, selected: f.model, tipFoot: (i) => topModels[i].sub, tipExtra: (i) => [{ name: 'Avg days in stock', value: dec(topModels[i].avgDays, 0) }] }), [t, byModel, f.model]);
  const ageLegend = B4.map((b, i) => ({ name: `${b} days`, color: t.ordinal[i] }));
  const groupCols = (label, subLabel) => [
    { key: 'key', label }, { key: 'sub', label: subLabel }, { key: 'n', label: 'Cars', align: 'r', fmt: int },
    ...B4.map((b) => ({ key: `b_${b}`, label: `${b} d`, align: 'r', fmt: int })),
    { key: 'avgDays', label: 'Avg days', align: 'r', fmt: (v) => dec(v, 0) }, { key: 'value', label: 'Value (AED)', align: 'r', fmt: int },
  ];
  const flat = (rows) => rows.map((r) => ({ ...r, __key: r.key, ...Object.fromEntries(B4.map((b) => [`b_${b}`, r.b[b]])) }));

  // slow movers
  const slow = useMemo(() => byModel.filter((r) => r.n >= 5).sort((a, b) => b.avgDays - a.avgDays).slice(0, 10), [byModel]);
  const slowOpt = useMemo(() => hBars(t, slow.map((r) => r.key), [{ name: 'Avg days in stock', data: slow.map((r) => Math.round(r.avgDays)), color: t.s1 }],
    { catWidth: 160, selected: f.model, endText: (i) => dayLabel(slow[i].avgDays), axisFmt: (v) => v, tipExtra: (i) => [{ name: 'Cars', value: int(slow[i].n) }, { name: 'Value', value: aed(slow[i].value) }] }), [t, slow, f.model]);

  // month-end history: cars in stock and their average age (rebuilt from IBV, receiving and out dates)
  const hist = useMemo(() => {
    const pts = [];
    for (let i = 11; i >= 0; i--) {
      const end = i === 0 ? asOf : monthEnd(addMonths(asOf, -i));
      pts.push(end);
    }
    const cards = V.filter((v) => v.veh && keep(v) && v.start != null && !v.stage.startsWith('Excluded') && !v.stage.startsWith('Check'));
    const n = pts.map(() => 0), age = pts.map(() => 0);
    for (const v of cards) {
      const closed = v.dispatched || v.stage.startsWith('Closed');
      const end = closed ? (v.out ?? v.start) : null;
      for (let j = 0; j < pts.length; j++) {
        const tt = pts[j];
        if (v.start > tt) continue;
        if (end != null && end <= tt) continue;
        if (v.recv != null ? v.recv > tt : v.inTransit) continue;
        n[j]++; age[j] += tt - v.start;
      }
    }
    return { keys: pts.map((d) => monthKey(d)), n, avgAge: age.map((a, j) => (n[j] ? Math.round((a / n[j]) * 10) / 10 : null)) };
  }, [V, f, asOf]);
  const histN = useMemo(() => lines(t, hist.keys, [{ name: 'Cars in stock', data: hist.n, color: t.s1 }], { xFmt: monthLabel }), [t, hist]);
  const histAge = useMemo(() => lines(t, hist.keys, [{ name: 'Average days in stock', data: hist.avgAge, color: t.s2 }], { xFmt: monthLabel, fmt: (v) => (v == null ? '-' : `${dec(v, 0)} d`), axisFmt: (v) => v }), [t, hist]);
  const histTable = {
    columns: [{ key: 'm', label: 'Month end' }, { key: 'n', label: 'Cars in stock', align: 'r', fmt: int }, { key: 'a', label: 'Avg days in stock', align: 'r', fmt: (v) => dec(v, 1) }],
    rows: hist.keys.map((key, j) => ({ __key: key, m: monthLabel(key), n: hist.n[j], a: hist.avgAge[j] })), search: false, csvName: 'stock-history',
  };

  const cols = [
    { key: 'ch', label: 'Chassis' },
    { key: 'brand', label: 'Brand' },
    { key: 'model', label: 'Model' },
    { key: 'entity', label: 'Entity' },
    { key: 'site', label: 'Location' },
    { key: 'comm', label: 'Commercial status', fmt: (v) => COMM_SHORT[v] || v },
    { key: 'start', label: 'IBV date', fmt: date, csv: (r) => date(r.start) },
    { key: 'days', label: 'Days in stock', align: 'r', fmt: (v, r) => (r.bucket === '90+' ? <Chip tone="serious" icon={false}>{int(v)}</Chip> : int(v)), csv: (r) => r.days },
    { key: 'tc', label: 'Total cost (AED)', align: 'r', fmt: int },
    { key: 'lcs', label: 'Landed cost', fmt: (v) => (v === 'Not posted - import' ? <Chip tone="warn">Not posted</Chip> : v), text: (r) => r.lcs },
    { key: 'cust', label: 'Customer (if reserved)', fmt: (v, r) => (r.comm === 'Unreserved' ? '-' : v || '-'), wrap: true },
  ];

  return (
    <>
      <PageHead title="Inventory & Aging" sub="What is sitting in stock, where, and for how long. Age counts from the IBV date, when the car became available in NetSuite." />
      <FilterBar asOf={asOf} values={f} set={set} reset={reset} defaults={defaults} filters={[
        { id: 'entity', label: 'Entity', options: opts.entity },
        { id: 'locType', label: 'Location type', options: opts.locType },
        { id: 'brand', label: 'Brand', options: opts.brand },
        { id: 'model', label: 'Model', options: opts.model },
        { id: 'comm', label: 'Commercial status', options: opts.comm },
        { id: 'fuel', label: 'Fuel type', options: opts.fuel },
        { id: 'bucket', label: 'Days in stock', options: opts.bucket },
      ]} picks={[{ id: 'age6', label: 'Age', fmt: (b) => `${b} days` }, { id: 'site', label: 'Location' }, { id: 'kpi', label: 'Card', fmt: (id) => KPI_CARDS[id]?.label ?? id }]} />
      <div className="kpis">
        <Kpi {...kpiClick(f, set, null)} label="Cars in stock" value={int(k.n)} sub={`${int(transit)} more on the way`} />
        <Kpi {...kpiClick(f, set, null)} label="Stock value" value={aed(k.value)} sub={aedFull(k.value)} tone="money" />
        <Kpi {...kpiClick(f, set, null)} label="Average days in stock" value={dec(k.days, 0)} unit="days" sub={`Median ${k.med ?? '-'} days`} />
        <Kpi {...kpiClick(f, set, 'aged')} label="Over 90 days" value={pct(k.agedShare)} sub={`${int(k.aged)} cars`}
          chip={k.agedShare > 0.25 ? <Chip tone="serious">Above 25% of stock</Chip> : null} />
        <Kpi {...kpiClick(f, set, 'unreserved')} label="Unreserved" value={int(k.unreserved)} sub={`${pct(k.n ? k.unreserved / k.n : null, 0)} of stock has no VSO`} />
        <Kpi {...kpiClick(f, set, 'pending')} label="Location not updated" value={int(k.pending)} sub="Received, still at Pending Receiving" tone="quiet" />
      </div>
      {k.pending > 0 && !f.locType.length && f.kpi[0] !== 'pending' && (
        <Banner tone="warn" title={`${int(k.pending)} received cars still show a Pending Receiving location`} onClick={() => set('kpi', ['pending'])}>
          Their IBV is complete but the location wasn't updated at receipt, so stock by location under-counts the yards. Click to list them.
        </Banner>
      )}
      {k.noLanded > 0 && (
        <Banner tone="accent" title={`${int(k.noLanded)} imported cars in stock carry no landed cost`}>
          Their value is purchase price only, so stock value is understated until freight, transport and clearance are posted.
        </Banner>
      )}
      <div className="grid-2">
        <ChartCard title="Stock by age" sub="Days since IBV, split by commercial status" table={ageTable}
          legend={COMMERCIAL.map((c, i) => ({ name: COMM_SHORT[c], color: t.series[i] }))}>
          <EChart option={ageOpt} height={320} label="Stock by age and commercial status" onPick={(i) => toggle('age6', B6[i])} />
        </ChartCard>
        <ChartCard title="Slowest-moving models" sub="Average days in stock, models with 5 or more cars" table={{ columns: groupCols('Model', 'Brand'), rows: flat(slow), search: false }}>
          <EChart option={slowOpt} height={rowsHeight(slow.length, 30)} label="Slowest-moving models" onPick={(i) => toggle('model', slow[i].key)} />
        </ChartCard>
      </div>
      <div className="grid-2">
        <ChartCard title="Stock by location" sub={`Top ${topSites.length} of ${bySite.length} locations, split by days in stock`} legend={ageLegend}
          table={{ columns: groupCols('Location', 'Type'), rows: flat(bySite), csvName: 'stock-by-location' }}>
          <EChart option={siteOpt} height={rowsHeight(topSites.length, 28)} label="Stock by location" onPick={(i) => toggle('site', topSites[i].key)} />
        </ChartCard>
        <ChartCard title="Stock by model" sub={`Top ${topModels.length} of ${byModel.length} models - switch to Table for all`} legend={ageLegend}
          table={{ columns: groupCols('Model', 'Brand'), rows: flat(byModel), csvName: 'stock-by-model' }}>
          <EChart option={modelOpt} height={rowsHeight(topModels.length, 26)} label="Stock by model" onPick={(i) => toggle('model', topModels[i].key)} />
        </ChartCard>
      </div>
      <div className="grid-2">
        <ChartCard title="Cars in stock at month end" sub="Rebuilt from IBV, receiving and out dates (entity, brand, model and fuel filters apply)" table={histTable}>
          <EChart option={histN} height={260} label="Cars in stock at month end" />
        </ChartCard>
        <ChartCard title="Average days in stock at month end" sub="Same cars as the chart on the left" table={histTable}>
          <EChart option={histAge} height={260} label="Average days in stock at month end" />
        </ChartCard>
      </div>
      <Card title="Cars in stock" sub={`Oldest first. ${k.estimated ? `${int(k.estimated)} cars have no IBV, so their age counts from the purchase date. ` : ''}Click a row for the car's full history.`}>
        <DataTable columns={cols} rows={stock} csvName="stock" initialSort={{ key: 'days', dir: -1 }} onRowClick={openVehicle} />
      </Card>
    </>
  );
}

function groupAge(rows, keyFn, subFn) {
  const m = new Map();
  for (const v of rows) {
    const key = keyFn(v) ?? 'Unknown';
    let e = m.get(key);
    if (!e) { e = { key, sub: subFn(v), n: 0, value: 0, days: 0, b: { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 } }; m.set(key, e); }
    e.n++; e.value += v.tc || 0; e.days += v.days || 0; e.b[v.bucket]++;
  }
  return [...m.values()].map((e) => ({ ...e, avgDays: e.n ? e.days / e.n : null })).sort((a, b) => b.n - a.n);
}
