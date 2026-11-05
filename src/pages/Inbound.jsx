import { useMemo } from 'react';
import { useData } from '../context.js';
import { useChartTheme } from '../theme.js';
import { useFilters, ymMatch, ymRange, match, matchAny, pick, applyPreds, kpiClick, kpiPred, sum, avg, options } from '../data/metrics.js';
import FilterBar from '../components/FilterBar.jsx';
import EChart from '../components/EChart.jsx';
import DataTable from '../components/DataTable.jsx';
import { hBars, columns, lines, rowsHeight } from '../components/charts.js';
import { Kpi, ChartCard, Banner, Card, Chip } from '../components/ui.jsx';
import { PageHead, timeAxis, clampRange, dayLabel, ETA_TONE, ETA_LABEL } from './common.jsx';
import { int, aed, pct, date, dec, monthStart, addMonths, yearOf } from '../format.js';

const VAR_BUCKETS = [
  ['On time', (d) => d <= 0], ['1-7', (d) => d >= 1 && d <= 7], ['8-14', (d) => d >= 8 && d <= 14],
  ['15-30', (d) => d >= 15 && d <= 30], ['31-60', (d) => d >= 31 && d <= 60], ['60+', (d) => d > 60],
];
const NO_CODE = 'No model code';
const etaBucket = (d) => (d == null ? null : VAR_BUCKETS.find(([, test]) => test(d))?.[0] ?? null);

export default function Inbound() {
  const { ds } = useData();
  const t = useChartTheme();
  const { S, V, meta } = ds;
  const asOf = meta.asOf;
  // recvT (receiving week/month), eta (receipt-vs-ETA bucket) and ship are chart-click selections (no dropdown)
  const defaults = { period: [String(yearOf(asOf))], entity: [], mode: [], route: [], brand: [], recvT: [], eta: [], ship: [], kpi: [], mcode: [] };
  const [f, set, reset, toggle] = useFilters(defaults);
  const setF = (id, v) => { set(id, v); if (id === 'period') set('recvT', []); }; // weeks/months on the axis depend on the period
  // KPI cards that stand for a subset of shipments: clicking one filters the page to it
  const KPI_CARDS = {
    onTheWay: { label: 'Shipments on the way', test: (s) => s.status === 'In transit' },
    thisMonth: { label: 'Received this month', test: (s) => s.recv != null && s.recv >= monthStart(asOf) && s.recv <= asOf },
    received: { label: 'Received shipments', test: (s) => s.recv != null },
    onTimeRb: { label: 'Received by PO date', test: (s) => s.rVsRb != null && s.rVsRb <= 0 },
    withEta: { label: 'Receipts with an ETA', test: (s) => s.rVsEta != null },
  };
  const opts = useMemo(() => ({
    entity: options(S, (s) => s.entity, { sortBy: 'name' }), mode: options(S, (s) => s.mode), route: options(S, (s) => s.route),
    brand: options(S.flatMap((s) => s.brands || []), (b) => b),
    years: [...new Set([yearOf(asOf), ...S.map((s) => yearOf(s.recv)).filter((y) => y != null)])].sort((a, b) => b - a),
  }), [S, asOf]);
  const range = ymRange(f.period); // span of the picked years/months, for the chart axis
  // shipment -> model codes on it (for the model-code pick)
  const shipCodes = useMemo(() => {
    const m = new Map();
    for (const v of V) {
      if (!v.ship || !v.modelCode) continue;
      if (!m.has(v.ship)) m.set(v.ship, new Set());
      m.get(v.ship).add(v.modelCode);
    }
    return m;
  }, [V]);
  const shipPreds = {
    entity: pick(f.entity, (s) => s.entity), mode: pick(f.mode, (s) => s.mode), route: pick(f.route, (s) => s.route),
    brand: f.brand.length ? (s) => matchAny(s.brands, f.brand) : null, ship: pick(f.ship, (s) => s.no), kpi: kpiPred(f, KPI_CARDS),
    mcode: f.mcode.length ? (s) => f.mcode.some((c) => shipCodes.get(s.no)?.has(c)) : null,
  };
  const ships = useMemo(() => applyPreds(S, shipPreds), [S, f]);
  const open = useMemo(() => ships.filter((s) => s.status === 'In transit').sort((a, b) => (b.daysOpen ?? 0) - (a.daysOpen ?? 0)), [ships]);
  const openChart = useMemo(() => applyPreds(S, shipPreds, 'ship').filter((s) => s.status === 'In transit').sort((a, b) => (b.daysOpen ?? 0) - (a.daysOpen ?? 0)), [S, f]);

  // receipts in the period; receiving week/month and ETA bucket apply to receipts only (open shipments have neither)
  const firstRecv = useMemo(() => S.reduce((m, s) => (s.recv != null && s.recv < m ? s.recv : m), Infinity), [S]);
  const inRange = (skip) => applyPreds(S, shipPreds, skip).filter((s) => s.recv != null && ymMatch(s.recv, f.period));
  const flowAx = useMemo(() => {
    const r0 = clampRange(range, inRange(), (s) => s.recv, asOf);
    return timeAxis(Math.max(r0.from, isFinite(firstRecv) ? firstRecv : r0.from), r0.to);
  }, [S, f, range.from, range.to, asOf, firstRecv]);
  const recPreds = { recvT: pick(f.recvT, (s) => flowAx.keyOf(s.recv)), eta: pick(f.eta, (s) => etaBucket(s.rVsEta)) };
  const receivedOf = (skip, shipSkip) => applyPreds(inRange(shipSkip), recPreds, skip);
  const received = useMemo(() => receivedOf(), [S, f, range.from, range.to, flowAx]);

  const k = useMemo(() => {
    const ms = monthStart(asOf), pms = addMonths(asOf, -1);
    const inMonth = (s, a, b) => s.recv != null && s.recv >= a && s.recv <= b;
    const withEta = received.filter((s) => s.rVsEta != null);
    const withRb = received.filter((s) => s.rVsRb != null);
    const leads = received.map((s) => s.dPoRecv).filter((x) => x != null).sort((a, b) => a - b);
    return {
      openN: open.length, openUnits: sum(open, (s) => s.units), openValue: sum(open, (s) => s.pp),
      late: open.filter((s) => s.stage !== 'In transit - ETA ahead').length,
      thisMonth: sum(ships.filter((s) => inMonth(s, ms, asOf)), (s) => s.units), lastMonth: sum(ships.filter((s) => inMonth(s, pms, ms - 1)), (s) => s.units),
      recUnits: sum(received, (s) => s.units), recN: received.length,
      lead: avg(received, (s) => s.dPoRecv), leadMed: leads.length ? leads[Math.floor(leads.length / 2)] : null,
      onTimeRb: withRb.length ? withRb.filter((s) => s.rVsRb <= 0).length / withRb.length : null, rbN: withRb.length,
      vsEta: avg(withEta, (s) => s.rVsEta), etaCover: received.length ? withEta.length / received.length : null, etaN: withEta.length,
    };
  }, [received, open, ships, asOf]);

  // receipts over time
  const flow = useMemo(() => {
    const ax = flowAx;
    const idx = new Map(ax.keys.map((x, i) => [x, i]));
    const units = ax.keys.map(() => 0), n = ax.keys.map(() => 0), lead = ax.keys.map(() => []);
    for (const s of receivedOf('recvT')) {
      const i = idx.get(ax.keyOf(s.recv));
      if (i == null) continue;
      units[i] += s.units; n[i]++; if (s.dPoRecv != null) lead[i].push(s.dPoRecv);
    }
    const leadAvg = lead.map((a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null));
    return { ax, units, n, leadAvg };
  }, [S, f, range.from, range.to, flowAx]);
  const pickRecv = (i) => toggle('recvT', flow.ax.keys[i]);
  const recOpt = useMemo(() => columns(t, flow.ax.keys, [{ name: 'Cars received', data: flow.units, color: t.s1 }],
    { xFmt: flow.ax.label, selected: f.recvT, tipExtra: (i) => [{ name: 'Shipments', value: int(flow.n[i]) }] }), [t, flow, f.recvT]);
  const leadOpt = useMemo(() => lines(t, flow.ax.keys, [{ name: 'Avg days PO to receipt', data: flow.leadAvg.map((x) => (x == null ? null : Math.round(x * 10) / 10)), color: t.s1 }],
    { xFmt: flow.ax.label, selected: f.recvT, fmt: (v) => (v == null ? '-' : `${dec(v, 0)} d`), axisFmt: (v) => v }), [t, flow, f.recvT]);
  const flowTable = {
    columns: [{ key: 'p', label: flow.ax.unit === 'month' ? 'Month' : 'Week' }, { key: 'n', label: 'Shipments', align: 'r', fmt: int },
      { key: 'u', label: 'Cars received', align: 'r', fmt: int }, { key: 'l', label: 'Avg days PO to receipt', align: 'r', fmt: (v) => dec(v, 1) }],
    rows: flow.ax.keys.map((key, i) => ({ __key: key, p: flow.ax.label(key), n: flow.n[i], u: flow.units[i], l: flow.leadAvg[i] })), search: false, csvName: 'receipts',
  };

  // open shipments by ETA status
  const stages = ['In transit - ETA passed', 'In transit - no ETA', 'In transit - ETA ahead'];
  const stColor = { 'In transit - ETA passed': t.critical, 'In transit - no ETA': t.warn, 'In transit - ETA ahead': t.good };

  // model codes on the way: cars still in transit on the open shipments, split by the shipment's ETA status
  const onWay = useMemo(() => {
    const ships = new Map(applyPreds(S, shipPreds, 'mcode').filter((s) => s.status === 'In transit').map((s) => [s.no, s]));
    const m = new Map();
    for (const v of V) {
      const sh = v.inTransit ? ships.get(v.ship) : null;
      if (!sh || !match(v.brand, f.brand)) continue;
      const key = v.modelCode ?? NO_CODE;
      let e = m.get(key);
      if (!e) { e = { key, model: v.model, brand: v.brand, n: 0, ships: new Set(), st: {} }; m.set(key, e); }
      e.n++; e.ships.add(v.ship); e.st[sh.stage] = (e.st[sh.stage] || 0) + 1;
    }
    return [...m.values()].map((e) => ({ ...e, __key: e.key, shipN: e.ships.size, passed: e.st[stages[0]] || 0, noEta: e.st[stages[1]] || 0, ahead: e.st[stages[2]] || 0 }))
      .sort((a, b) => b.n - a.n);
  }, [S, V, f, shipCodes]);
  const topCodes = [...onWay.slice(0, 20), ...onWay.slice(20).filter((e) => f.mcode.includes(e.key))];
  const codesMissing = onWay.length > 0 && onWay.every((e) => e.key === NO_CODE); // dataset saved before model codes were kept
  const codeOpt = useMemo(() => hBars(t, topCodes.map((e) => e.key), stages.map((st, k) => ({
    name: ETA_LABEL[st], color: stColor[st], data: topCodes.map((e) => [e.passed, e.noEta, e.ahead][k]),
  })), {
    stacked: true, catWidth: 280, selected: f.mcode,
    tipExtra: (i) => [{ name: 'Model', value: [topCodes[i].brand, topCodes[i].model].filter(Boolean).join(' ') || '-' }, { name: 'Shipments', value: int(topCodes[i].shipN) }],
  }), [t, onWay, f.mcode]);
  const openOpt = useMemo(() => hBars(t, openChart.map((s) => s.no), stages.map((st) => ({
    name: ETA_LABEL[st], color: stColor[st], data: openChart.map((s) => (s.stage === st ? s.units : 0)),
  })), {
    stacked: true, catWidth: 110, endText: (i) => dayLabel(openChart[i].daysOpen), selected: f.ship,
    tipExtra: (i) => [{ name: 'Model', value: openChart[i].mainModel || '-' }, { name: 'ETA', value: openChart[i].eta != null ? date(openChart[i].eta) : 'none' }, { name: 'Days since shipment created', value: int(openChart[i].daysOpen) }],
    tipFoot: (i) => (openChart[i].vendors || []).join(', '),
  }), [t, openChart, f.ship]);

  // receipt vs ETA distribution
  const dist = useMemo(() => {
    const w = receivedOf('eta').filter((s) => s.rVsEta != null);
    return VAR_BUCKETS.map(([name, test]) => ({ name, n: w.filter((s) => test(s.rVsEta)).length, units: sum(w.filter((s) => test(s.rVsEta)), (s) => s.units) }));
  }, [S, f, range.from, range.to, flowAx]);
  const distOpt = useMemo(() => columns(t, dist.map((d) => d.name), [{ name: 'Shipments', data: dist.map((d) => d.n), color: t.s1 }],
    { xFmt: (x) => (x === 'On time' ? 'On time' : `${x} d late`), selected: f.eta, tipExtra: (i) => [{ name: 'Cars', value: int(dist[i].units) }] }), [t, dist, f.eta]);

  // mode
  const modes = useMemo(() => {
    const m = new Map();
    for (const s of receivedOf(undefined, 'mode')) m.set(s.mode, (m.get(s.mode) || 0) + s.units);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [S, f, range.from, range.to, flowAx]);
  const modeOpt = useMemo(() => hBars(t, modes.map((m) => m[0]), [{ name: 'Cars received', data: modes.map((m) => m[1]), color: t.s1 }], { selected: f.mode }), [t, modes, f.mode]);

  // completeness for shipments created in the period
  const created = ships.filter((s) => s.created != null && ymMatch(s.created, f.period));
  const fields = [
    ['ETA', (s) => s.eta != null], ['Actual arrival (ATA)', (s) => s.ata != null], ['Bill of lading', (s) => s.bl != null],
    ['Vessel', (s) => s.vessel != null], ['Port of loading', (s) => s.pol != null], ['Port of discharge', (s) => s.pod != null],
    ['Containers', (s) => s.containers != null],
  ];

  const shipCols = [
    { key: 'no', label: 'Shipment' },
    { key: 'stage', label: 'Status', fmt: (v) => <Chip tone={ETA_TONE[v] || 'neutral'}>{ETA_LABEL[v] || v}</Chip>, text: (r) => ETA_LABEL[r.stage] || r.stage },
    { key: 'created', label: 'Created', fmt: date, csv: (r) => date(r.created) },
    { key: 'mainModel', label: 'Main model' },
    { key: 'units', label: 'Cars', align: 'r', fmt: int },
    { key: 'vendors', label: 'Vendor', fmt: (v) => (v || []).join(', '), text: (r) => (r.vendors || []).join(', '), wrap: true },
    { key: 'mode', label: 'Mode' },
    { key: 'bl', label: 'BL' },
    { key: 'pod', label: 'Port of discharge' },
    { key: 'eta', label: 'ETA', fmt: date, csv: (r) => date(r.eta) },
    { key: 'recv', label: 'Received', fmt: date, csv: (r) => date(r.recv) },
    { key: 'rVsEta', label: 'Receipt vs ETA (d)', align: 'r', fmt: (v) => (v == null ? '-' : int(v)) },
    { key: 'dPoRecv', label: 'PO to receipt (d)', align: 'r', fmt: (v) => (v == null ? '-' : int(v)) },
    { key: 'lcs', label: 'Landed cost' },
  ];
  const tableRows = useMemo(() => [...open, ...received.filter((s) => s.status !== 'In transit')], [open, received]);

  return (
    <>
      <PageHead title="Inbound" sub="What is coming, when it should land, and how reliably shipments arrive against plan." />
      <FilterBar asOf={asOf} values={f} set={setF} reset={reset} defaults={defaults} filters={[
        { id: 'period', label: 'Receiving date', type: 'yearmonth', years: opts.years },
        { id: 'entity', label: 'Entity', options: opts.entity },
        { id: 'mode', label: 'Shipping mode', options: opts.mode },
        { id: 'route', label: 'Supply route', options: opts.route },
        { id: 'brand', label: 'Brand', options: opts.brand },
      ]} picks={[
        { id: 'recvT', label: 'Received', fmt: flowAx.label }, { id: 'eta', label: 'Receipt vs ETA', fmt: (x) => (x === 'On time' ? x : `${x} d late`) },
        { id: 'ship', label: 'Shipment' }, { id: 'kpi', label: 'Card', fmt: (id) => KPI_CARDS[id]?.label ?? id }, { id: 'mcode', label: 'Model code' },
      ]} />
      <div className="kpis">
        <Kpi {...kpiClick(f, set, 'onTheWay')} label="Shipments on the way" value={int(k.openN)} sub={`${int(k.openUnits)} cars · ${aed(k.openValue)}`}
          chip={k.late ? <Chip tone="critical">{int(k.late)} past or without ETA</Chip> : null} />
        <Kpi {...kpiClick(f, set, 'thisMonth')} label="Received this month" value={int(k.thisMonth)} unit="cars" sub={`Last month ${int(k.lastMonth)} cars`} />
        <Kpi {...kpiClick(f, set, 'received')} label="Received in period" value={int(k.recUnits)} unit="cars" sub={`${int(k.recN)} shipments`} />
        <Kpi {...kpiClick(f, set, null)} label="PO to receipt" value={dec(k.lead, 0)} unit="days avg" sub={`Median ${k.leadMed ?? '-'} days`} />
        <Kpi {...kpiClick(f, set, 'onTimeRb')} label="Received by PO date" value={pct(k.onTimeRb, 0)} sub={`On or before Receive-By · ${int(k.rbN)} shipments`} />
        <Kpi {...kpiClick(f, set, 'withEta')} label="Receipt vs ETA" value={k.vsEta == null ? '-' : `${k.vsEta > 0 ? '+' : ''}${dec(k.vsEta, 0)}`} unit="days avg"
          sub={`ETA known for ${pct(k.etaCover, 0)} of receipts`} tone="quiet" />
      </div>
      {k.late > 0 && (
        <Banner tone="warn" title={`${int(k.late)} of ${int(k.openN)} open shipments have an ETA in the past or none`}>
          The arrival schedule can't be trusted until ETAs are kept current. Update the ETA (and ATA on arrival) on the inbound shipment in NetSuite.
        </Banner>
      )}
      <div className="grid-2">
        <ChartCard title={`Cars received per ${flow.ax.unit}`} sub={`By receiving date in the yard · receiving dates are recorded from ${isFinite(firstRecv) ? date(firstRecv) : '-'}`} table={flowTable}>
          <EChart option={recOpt} height={300} label="Cars received over time" onPick={pickRecv} />
        </ChartCard>
        <ChartCard title="Days from PO to receipt" sub={`Average per receiving ${flow.ax.unit}`} table={flowTable}>
          <EChart option={leadOpt} height={300} label="Average days from PO to receipt" onPick={pickRecv} />
        </ChartCard>
      </div>
      <ChartCard title="Model codes on the way"
        sub={`${int(sum(onWay, (e) => e.n))} cars in transit across ${int(onWay.length)} model codes${onWay.length > topCodes.length ? ` - top ${topCodes.length} shown, switch to Table for all` : ''} · split by the shipment's ETA status`}
        legend={stages.map((st) => ({ name: ETA_LABEL[st], color: stColor[st] }))}
        table={{ columns: [
          { key: 'key', label: 'Model code' }, { key: 'brand', label: 'Brand' }, { key: 'model', label: 'Model' },
          { key: 'n', label: 'Cars', align: 'r', fmt: int }, { key: 'shipN', label: 'Shipments', align: 'r', fmt: int },
          { key: 'passed', label: 'ETA passed', align: 'r', fmt: int }, { key: 'noEta', label: 'No ETA', align: 'r', fmt: int }, { key: 'ahead', label: 'ETA ahead', align: 'r', fmt: int },
        ], rows: onWay, csvName: 'model-codes-on-the-way' }}>
        {codesMissing ? <p className="muted" style={{ padding: 12 }}>This dataset was saved before model codes were kept - run NetSuite Data Sync (or upload the export) again to see them.</p>
          : onWay.length ? <EChart option={codeOpt} height={rowsHeight(topCodes.length, 26)} label="Model codes on the way" onPick={(i) => toggle('mcode', topCodes[i].key === NO_CODE ? null : topCodes[i].key)} />
            : <p className="muted" style={{ padding: 12 }}>No cars on the way for these filters.</p>}
      </ChartCard>
      <div className="grid-2">
        <ChartCard title="On the way now" sub="Open inbound shipments, cars per shipment · bar end = days since the shipment was created"
          legend={stages.map((st) => ({ name: ETA_LABEL[st], color: stColor[st] }))}
          table={{ columns: shipCols.filter((c) => ['no', 'stage', 'created', 'mainModel', 'units', 'vendors', 'eta'].includes(c.key)), rows: open, csvName: 'open-shipments', search: false }}>
          {openChart.length ? <EChart option={openOpt} height={rowsHeight(openChart.length, 24)} label="Open shipments" onPick={(i) => toggle('ship', openChart[i].no)} /> : <p className="muted" style={{ padding: 12 }}>No open shipments for these filters.</p>}
        </ChartCard>
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <ChartCard title="Receipt against ETA" sub={`Days after ETA that shipments were received in the yard (includes port clearance) · ${int(k.etaN)} of ${int(k.recN)} receipts have an ETA`}
            table={{ columns: [{ key: 'name', label: 'Days after ETA' }, { key: 'n', label: 'Shipments', align: 'r', fmt: int }, { key: 'units', label: 'Cars', align: 'r', fmt: int }], rows: dist.map((d) => ({ ...d, __key: d.name })), search: false }}>
            <EChart option={distOpt} height={240} label="Receipt against ETA" onPick={(i) => toggle('eta', dist[i].name)} />
          </ChartCard>
          <ChartCard title="Cars received by shipping mode" sub="Mode taken from the containers field and shipment memo"
            table={{ columns: [{ key: 'm', label: 'Mode' }, { key: 'u', label: 'Cars', align: 'r', fmt: int }], rows: modes.map(([m, u]) => ({ m, u, __key: m })), search: false }}>
            <EChart option={modeOpt} height={rowsHeight(modes.length, 30)} label="Cars received by shipping mode" onPick={(i) => toggle('mode', modes[i][0])} />
          </ChartCard>
        </div>
      </div>
      <Card title="Shipment data completeness" sub={`${int(created.length)} shipments created in the period - fields the schedule and on-time KPIs depend on`}>
        <div style={{ padding: '4px 6px 6px' }}>
          {fields.map(([name, test]) => {
            const n = created.filter(test).length, share = created.length ? n / created.length : 0;
            return (
              <div className="meter-row" key={name}>
                <span>{name}</span>
                <div className="meter" role="meter" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${name} filled`}><i style={{ width: `${share * 100}%` }} /></div>
                <span className="num" style={{ textAlign: 'right' }}>{pct(share, 0)}</span>
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Shipments" sub="Open shipments first, then shipments received in the period">
        <DataTable columns={shipCols} rows={tableRows} csvName="inbound-shipments" />
      </Card>
    </>
  );
}
