import { useMemo, useState } from 'react';
import { useData } from '../context.js';
import { useChartTheme } from '../theme.js';
import { useFilters, ymMatch, ymRange, pick, applyPreds, kpiClick, kpiPred, avg, options } from '../data/metrics.js';
import FilterBar from '../components/FilterBar.jsx';
import EChart from '../components/EChart.jsx';
import DataTable from '../components/DataTable.jsx';
import { hBars, columns, rowsHeight } from '../components/charts.js';
import { Kpi, ChartCard, Card, Chip } from '../components/ui.jsx';
import { PageHead, timeAxis, clampRange } from './common.jsx';
import { int, aed, pct, date, dec, yearOf } from '../format.js';
import ModelCost from '../components/ModelCost.jsx';
import { IMPORT } from '../data/landed.js';

const PAID = 'Paid - awaiting delivery', RES = 'Reserved (not fully paid)';
const UNCLEAR = 'Not set / unclear';

export default function Outbound() {
  const { ds, openVehicle } = useData();
  const t = useChartTheme();
  const { V, meta } = ds;
  const asOf = meta.asOf;
  // outT (dispatch day/week/month) and model are chart-click selections
  const defaults = { period: [String(yearOf(asOf))], entity: [], brand: [], dest: [], comm: [], outT: [], model: [], kpi: [] };
  const [f, set, reset, toggle] = useFilters(defaults);
  const setF = (id, v) => { set(id, v); if (id === 'period') set('outT', []); }; // buckets depend on the period
  const [grain, setGrainRaw] = useState('week');
  const setGrain = (g) => { setGrainRaw(g); set('outT', []); };
  // KPI cards that stand for a subset of cars: clicking one filters the page to it
  const KPI_CARDS = {
    paid: { label: 'Paid, awaiting delivery', test: (v) => v.comm === PAID },
    res: { label: 'Reserved, not fully paid', test: (v) => v.comm === RES },
    disp: { label: 'Dispatched', test: (v) => v.dispatched },
    posted: { label: 'Dispatched imports with landed cost posted', test: (v) => v.dispatched && v.route === IMPORT && v.lcs === 'Posted' },
  };
  const relevant = useMemo(() => V.filter((v) => v.openVso || v.dispatched), [V]);
  const opts = useMemo(() => ({
    entity: options(relevant, (v) => v.entity, { sortBy: 'name' }), brand: options(relevant, (v) => v.brand),
    dest: options(relevant, (v) => v.destC), comm: [{ value: PAID, label: 'Paid, awaiting delivery' }, { value: RES, label: 'Reserved, not fully paid' }],
    years: [...new Set([yearOf(asOf), ...relevant.map((v) => yearOf(v.out)).filter((y) => y != null)])].sort((a, b) => b - a),
  }), [relevant, asOf]);
  const range = ymRange(f.period); // span of the picked years/months, for the chart axis
  const keepPreds = {
    entity: pick(f.entity, (v) => v.entity), brand: pick(f.brand, (v) => v.brand), dest: pick(f.dest, (v) => v.destC),
    model: pick(f.model, (v) => v.model ?? 'Unknown'), kpi: kpiPred(f, KPI_CARDS),
  };
  // waiting cars: waiting status applies here only; dispatched cars: dispatch period and bucket apply there only
  const openOf = (skip) => applyPreds(V.filter((v) => v.openVso), { ...keepPreds, comm: pick(f.comm, (v) => v.comm) }, skip);
  const open = useMemo(() => openOf(), [V, f]);
  const dispBase = (skip) => applyPreds(V.filter((v) => v.dispatched && v.out != null && ymMatch(v.out, f.period)), keepPreds, skip);
  const flowAx = useMemo(() => {
    const r = clampRange(range, dispBase(), (v) => v.out, asOf);
    return timeAxis(r.from, r.to, grain);
  }, [V, f, grain, range.from, range.to, asOf]);
  const dispOf = (skip) => applyPreds(dispBase(skip), { outT: pick(f.outT, (v) => flowAx.keyOf(v.out)) }, skip);
  const disp = useMemo(() => dispOf(), [V, f, range.from, range.to, flowAx]);

  const k = useMemo(() => {
    const paid = open.filter((v) => v.comm === PAID), res = open.filter((v) => v.comm === RES);
    // weeks covered: the picked years/months up to today (gaps between picks don't count), or first dispatch to today
    const days = f.period.length ? f.period.reduce((tot, p) => { const r = ymRange([p]); return tot + Math.max(0, Math.min(r.to, asOf) - r.from + 1); }, 0)
      : asOf - disp.reduce((m, v) => Math.min(m, v.out), asOf) + 1;
    const span = Math.max(1, days / 7);
    const imp = disp.filter((v) => v.route === IMPORT);
    const posted = imp.filter((v) => v.lcs === 'Posted');
    return {
      paid: paid.length, paidStock: paid.filter((v) => v.inStock).length, paidTransit: paid.filter((v) => v.inTransit).length,
      paid30: paid.filter((v) => v.inStock && v.daysVst > 30).length,
      res: res.length, res60: res.filter((v) => v.daysVst > 60).length, resTransit: res.filter((v) => v.inTransit).length,
      disp: disp.length, perWeek: disp.length / span,
      vstToDisp: avg(disp, (v) => v.dVstDisp),
      avgLC: avg(posted, (v) => v.lc), imp: imp.length, posted: posted.length,
    };
  }, [open, disp, V, f, asOf, range.from, range.to]);

  // dispatch throughput
  const flow = useMemo(() => {
    const ax = flowAx;
    const idx = new Map(ax.keys.map((x, i) => [x, i]));
    const n = ax.keys.map(() => 0);
    for (const v of dispOf('outT')) { const i = idx.get(ax.keyOf(v.out)); if (i != null) n[i]++; }
    return { ax, n };
  }, [V, f, range.from, range.to, flowAx]);
  const flowOpt = useMemo(() => columns(t, flow.ax.keys, [{ name: 'Cars dispatched', data: flow.n, color: t.s1 }],
    { xFmt: flow.ax.label, selected: f.outT }), [t, flow, f.outT]);

  // cost by model follows the cards: the waiting cars when "Paid, awaiting delivery" or "Reserved" is picked, else the
  // dispatched cars (the chart skips its own model pick)
  const waitingCard = f.kpi[0] === 'paid' || f.kpi[0] === 'res';
  const modelCars = useMemo(() => (waitingCard ? openOf('model') : dispOf('model')), [V, f, range.from, range.to, flowAx]);
  // models by commercial state; a picked card (Paid / Reserved / Dispatched) already narrows the cars, so the chart
  // re-sorts to that one state (the chart skips its own model pick)
  const stateModels = useMemo(() => {
    const m = new Map();
    const add = (v, k) => {
      const key = v.model ?? 'Unknown';
      const e = m.get(key) || { key, brand: v.brand, res: 0, paid: 0, sold: 0 };
      e[k]++; m.set(key, e);
    };
    for (const v of openOf('model')) add(v, v.comm === PAID ? 'paid' : 'res');
    for (const v of dispOf('model')) if (v.veh) add(v, 'sold');
    return [...m.values()].map((e) => ({ ...e, __key: e.key, n: e.res + e.paid + e.sold })).sort((a, b) => b.n - a.n);
  }, [V, f, range.from, range.to, flowAx]);
  const topStateModels = [...stateModels.slice(0, 15), ...stateModels.slice(15).filter((e) => f.model.includes(e.key))];
  const stateModelOpt = useMemo(() => hBars(t, topStateModels.map((e) => e.key), [
    { name: 'Reserved', data: topStateModels.map((e) => e.res), color: t.s2 },
    { name: 'Paid, awaiting delivery', data: topStateModels.map((e) => e.paid), color: t.s3 },
    { name: 'Sold', data: topStateModels.map((e) => e.sold), color: t.s1 },
  ], { stacked: true, catWidth: 150, selected: f.model, tipFoot: (i) => topStateModels[i].brand }), [t, stateModels, f.model]);
  const modelWhat = f.kpi[0] === 'paid' ? 'cars paid, awaiting delivery' : f.kpi[0] === 'res' ? 'reserved cars' : 'cars dispatched';

  // destinations: "Not set / unclear" stands for two raw values
  const destVals = (key) => (key === UNCLEAR ? ['Not set', 'Unspecified'] : [key]);
  const dispDest = useMemo(() => {
    const m = new Map();
    for (const v of dispOf('dest')) { const key = v.destC === 'Not set' || v.destC === 'Unspecified' ? UNCLEAR : v.destC; m.set(key, (m.get(key) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [V, f, range.from, range.to, flowAx]);
  const dispDestOpt = useMemo(() => hBars(t, dispDest.map((d) => d[0]), [{ name: 'Cars dispatched', data: dispDest.map((d) => d[1]), color: t.s1 }],
    { catWidth: 140, selected: dispDest.map(([key]) => key).filter((key) => destVals(key).some((x) => f.dest.includes(x))) }), [t, dispDest, f.dest]);

  const cols = [
    { key: 'ch', label: 'Chassis' },
    { key: 'model', label: 'Model' },
    { key: 'comm', label: 'Status', fmt: (v) => <Chip tone={v === PAID ? 'brand' : 'warn'} icon={false}>{v === PAID ? 'Paid, awaiting delivery' : 'Reserved, not fully paid'}</Chip>, text: (r) => r.comm },
    { key: 'stage', label: 'Where', fmt: (v, r) => (v === 'In transit' ? 'On the way' : r.site) },
    { key: 'vst', label: 'VST' },
    { key: 'vstDate', label: 'VST date', fmt: date, csv: (r) => date(r.vstDate) },
    { key: 'daysVst', label: 'Days since VST', align: 'r', fmt: (v, r) => (r.comm === PAID && v > 30 ? <Chip tone="serious" icon={false}>{int(v)}</Chip> : int(v)), csv: (r) => r.daysVst },
    { key: 'cust', label: 'Customer', wrap: true },
    { key: 'rep', label: 'Sales rep' },
    { key: 'destC', label: 'Destination' },
    { key: 'entity', label: 'Entity' },
  ];

  return (
    <>
      <PageHead title="Outbound" sub="What is ready to leave, how many cars moved out, and what the cars that left cost us." />
      <FilterBar asOf={asOf} values={f} set={setF} reset={reset} defaults={defaults} filters={[
        { id: 'period', label: 'Dispatch date', type: 'yearmonth', years: opts.years },
        { id: 'entity', label: 'Entity', options: opts.entity },
        { id: 'brand', label: 'Brand', options: opts.brand },
        { id: 'dest', label: 'Destination', options: opts.dest },
        { id: 'comm', label: 'Waiting status', options: opts.comm },
      ]} picks={[
        { id: 'outT', label: 'Dispatched', fmt: flowAx.label }, { id: 'model', label: 'Model' },
        { id: 'kpi', label: 'Card', fmt: (id) => KPI_CARDS[id]?.label ?? id },
      ]} />
      <div className="kpis">
        <Kpi {...kpiClick(f, set, 'paid')} label="Paid, awaiting delivery" value={int(k.paid)} sub={`${int(k.paidStock)} in stock · ${int(k.paidTransit)} on the way`}
          chip={k.paid30 ? <Chip tone="serious">{int(k.paid30)} waiting over 30 days</Chip> : null} />
        <Kpi {...kpiClick(f, set, 'res')} label="Reserved, not fully paid" value={int(k.res)} sub={`${int(k.resTransit)} still on the way`}
          chip={k.res60 ? <Chip tone="warn">{int(k.res60)} over 60 days</Chip> : null} />
        <Kpi {...kpiClick(f, set, 'disp')} label="Dispatched" value={int(k.disp)} unit="cars" sub={`${dec(k.perWeek, 0)} a week on average`} />
        <Kpi {...kpiClick(f, set, null)} label="Order to dispatch" value={dec(k.vstToDisp, 0)} unit="days avg" sub="VST date to out date" />
        <Kpi {...kpiClick(f, set, 'posted')} label="Avg landed cost" value={aed(k.avgLC)} tone="money"
          sub={`Per dispatched import where posted · ${int(k.posted)} of ${int(k.imp)} imports`} />
        <Kpi {...kpiClick(f, set, 'posted')} label="Landed cost posted" value={pct(k.imp ? k.posted / k.imp : null, 0)}
          sub={`Imports only: ${int(k.posted)} of ${int(k.imp)} dispatched imports`} />
      </div>
      <div className="grid-2">
        <ChartCard title={`Cars dispatched per ${flow.ax.unit}`} sub="Completed dispatches by out date. Planned dispatches need a planned date in NetSuite."
          tools={<div className="seg" role="group" aria-label="Grain">
            <button type="button" aria-pressed={grain === 'week'} onClick={() => setGrain('week')}>Week</button>
            <button type="button" aria-pressed={grain === 'month'} onClick={() => setGrain('month')}>Month</button>
          </div>}
          table={{ columns: [{ key: 'p', label: 'Period' }, { key: 'n', label: 'Cars dispatched', align: 'r', fmt: int }], rows: flow.ax.keys.map((key, i) => ({ __key: key, p: flow.ax.label(key), n: flow.n[i] })), search: false, csvName: 'dispatches' }}>
          {flow.n.some((x) => x > 0) ? <EChart option={flowOpt} height={300} label="Cars dispatched over time" onPick={(i) => toggle('outT', flow.ax.keys[i])} />
            : <p className="muted" style={{ padding: 12 }}>No cars dispatched for these filters.</p>}
        </ChartCard>
        <ChartCard title="Models: reserved, awaiting delivery and sold"
          sub={`${int(stateModels.length)} models · sold = dispatched in the period${stateModels.length > topStateModels.length ? ` - top ${topStateModels.length} shown, switch to Table for all` : ''}`}
          legend={[{ name: 'Reserved', color: t.s2 }, { name: 'Paid, awaiting delivery', color: t.s3 }, { name: 'Sold', color: t.s1 }]}
          table={{ columns: [
            { key: 'key', label: 'Model' }, { key: 'brand', label: 'Brand' }, { key: 'res', label: 'Reserved', align: 'r', fmt: int },
            { key: 'paid', label: 'Awaiting delivery', align: 'r', fmt: int }, { key: 'sold', label: 'Sold', align: 'r', fmt: int },
            { key: 'n', label: 'Total', align: 'r', fmt: int },
          ], rows: stateModels, csvName: 'models-by-state' }}>
          {topStateModels.length ? <EChart option={stateModelOpt} height={rowsHeight(topStateModels.length, 26)} label="Models by reserved, awaiting delivery and sold" onPick={(k) => toggle('model', topStateModels[k].key)} />
            : <p className="muted" style={{ padding: 12 }}>No cars for these filters.</p>}
        </ChartCard>
      </div>
      <div className="grid-2">
        <ModelCost cars={modelCars} selected={f.model} onPick={(m) => toggle('model', m)} what={modelWhat} csvPrefix={waitingCard ? 'waiting' : 'dispatched'} share={false} />
        <ChartCard title="Dispatched, by destination" sub="Cars dispatched in the period"
          table={{ columns: [{ key: 'k', label: 'Destination' }, { key: 'n', label: 'Cars', align: 'r', fmt: int }], rows: dispDest.map(([k2, n]) => ({ k: k2, n, __key: k2 })), search: false }}>
          {dispDest.length ? <EChart option={dispDestOpt} height={rowsHeight(dispDest.length, 26)} label="Dispatched cars by destination" onPick={(i) => toggle('dest', destVals(dispDest[i][0]))} />
            : <p className="muted" style={{ padding: 12 }}>No cars dispatched for these filters.</p>}
        </ChartCard>
      </div>
      <Card title="Cars waiting to leave" sub="Open VSOs, longest wait first. Click a row for the car's full history.">
        <DataTable columns={cols} rows={open} csvName="open-vsos" initialSort={{ key: 'daysVst', dir: -1 }} onRowClick={openVehicle} />
      </Card>
    </>
  );
}
