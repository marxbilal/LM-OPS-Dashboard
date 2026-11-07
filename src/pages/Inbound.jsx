import { useMemo } from 'react';
import { useData } from '../context.js';
import { useChartTheme } from '../theme.js';
import { useFilters, ymMatch, ymRange, match, matchAny, pick, applyPreds, kpiClick, sum, options } from '../data/metrics.js';
import FilterBar from '../components/FilterBar.jsx';
import EChart from '../components/EChart.jsx';
import DataTable from '../components/DataTable.jsx';
import { hBars, columns, lines, rowsHeight } from '../components/charts.js';
import { Kpi, ChartCard, Banner, Card, Chip } from '../components/ui.jsx';
import ModelCost from '../components/ModelCost.jsx';
import LandedMix, { lcCatPred } from '../components/LandedMix.jsx';
import { LCS } from '../data/landed.js';
import { PageHead, timeAxis, clampRange, ETA_TONE, ETA_LABEL } from './common.jsx';
import { int, aed, aedFull, pct, date, dec, yearOf } from '../format.js';

const NO_CODE = 'No model code';

export default function Inbound() {
  const { ds } = useData();
  const t = useChartTheme();
  const { S, V, meta, LC } = ds;
  const asOf = meta.asOf;
  // recvT (receiving week/month), mcode (model code), model, lcCat (cost type) and lcs (landed cost status) are chart-click selections
  const defaults = { period: [String(yearOf(asOf))], entity: [], mode: [], route: [], brand: [], recvT: [], kpi: [], mcode: [], model: [], lcCat: [], lcs: [] };
  const [f, set, reset, toggle] = useFilters(defaults);
  const setF = (id, v) => { set(id, v); if (id === 'period') set('recvT', []); }; // weeks/months on the axis depend on the period
  // the one KPI card that stands for a subset of the received cars
  const KPI_CARDS = { posted: { label: 'Received cars with landed cost posted', test: (v) => v.lc > 0 } };
  const opts = useMemo(() => ({
    entity: options(S, (s) => s.entity, { sortBy: 'name' }), mode: options(S, (s) => s.mode), route: options(S, (s) => s.route),
    brand: options(S.flatMap((s) => s.brands || []), (b) => b),
    years: [...new Set([yearOf(asOf), ...S.map((s) => yearOf(s.recv)).filter((y) => y != null)])].sort((a, b) => b - a),
  }), [S, asOf]);
  const range = ymRange(f.period); // span of the picked years/months, for the chart axis
  const shipByNo = useMemo(() => new Map(S.map((s) => [s.no, s])), [S]);
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
    brand: f.brand.length ? (s) => matchAny(s.brands, f.brand) : null,
    mcode: f.mcode.length ? (s) => f.mcode.some((c) => shipCodes.get(s.no)?.has(c)) : null,
  };
  const ships = useMemo(() => applyPreds(S, shipPreds), [S, f]);
  const open = useMemo(() => ships.filter((s) => s.status === 'In transit').sort((a, b) => (b.daysOpen ?? 0) - (a.daysOpen ?? 0)), [ships]);

  // receipts: shipments received in the date filter; the receiving week/month pick applies to receipts only
  const firstRecv = useMemo(() => S.reduce((m, s) => (s.recv != null && s.recv < m ? s.recv : m), Infinity), [S]);
  const inRange = (shipSkip) => applyPreds(S, shipPreds, shipSkip).filter((s) => s.recv != null && ymMatch(s.recv, f.period));
  const flowAx = useMemo(() => {
    const r0 = clampRange(range, inRange(), (s) => s.recv, asOf);
    return timeAxis(Math.max(r0.from, isFinite(firstRecv) ? firstRecv : r0.from), r0.to);
  }, [S, f, range.from, range.to, asOf, firstRecv]);
  const receivedOf = (skip, shipSkip) => applyPreds(inRange(shipSkip), { recvT: pick(f.recvT, (s) => flowAx.keyOf(s.recv)) }, skip);
  const received = useMemo(() => receivedOf(), [S, f, range.from, range.to, flowAx]);
  // the cars on those shipments (vehicles only - no spare parts or chargers); brand, model and the KPI card apply per car,
  // so a mixed shipment counts only the picked brand's cars
  const carsOf = (skip) => {
    const sh = new Set(receivedOf(skip === 'recvT' ? 'recvT' : undefined, skip === 'brand' || skip === 'mode' ? skip : undefined).map((s) => s.no));
    const card = f.kpi[0] && skip !== 'kpi' ? KPI_CARDS[f.kpi[0]]?.test : null;
    const lcCat = lcCatPred(f.lcCat, LC); // landed-cost type picked on the distribution chart
    return V.filter((v) => v.veh && v.ship && sh.has(v.ship) && (skip === 'brand' || match(v.brand, f.brand))
      && (skip === 'model' || !f.model.length || f.model.includes(v.model ?? 'Unknown')) && (skip === 'lcCat' || !lcCat || lcCat(v))
      && (skip === 'lcs' || !f.lcs.length || f.lcs.includes(v.lcs)) && (!card || card(v)));
  };
  const cars = useMemo(() => carsOf(), [S, V, f, range.from, range.to, flowAx]);

  const k = useMemo(() => {
    const pp = sum(cars, (v) => v.pp), lc = sum(cars, (v) => v.lc);
    const shipsN = new Set(cars.map((v) => v.ship)).size;
    return {
      units: cars.length, ships: shipsN, pp, lc, total: pp + lc,
      posted: cars.filter((v) => v.lc > 0).length,
      openN: open.length, late: open.filter((s) => s.stage !== 'In transit - ETA ahead').length,
    };
  }, [cars, open]);

  // receipts over time: cars by their shipment's receiving date; average PO-to-receipt days per shipment
  const flow = useMemo(() => {
    const ax = flowAx;
    const idx = new Map(ax.keys.map((x, i) => [x, i]));
    const units = ax.keys.map(() => 0), n = ax.keys.map(() => 0), lead = ax.keys.map(() => []);
    for (const v of carsOf('recvT')) { const i = idx.get(ax.keyOf(shipByNo.get(v.ship).recv)); if (i != null) units[i]++; }
    for (const s of receivedOf('recvT')) {
      const i = idx.get(ax.keyOf(s.recv));
      if (i == null) continue;
      n[i]++; if (s.dPoRecv != null) lead[i].push(s.dPoRecv);
    }
    const leadAvg = lead.map((a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null));
    return { ax, units, n, leadAvg };
  }, [S, V, f, range.from, range.to, flowAx]);
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

  // received cars by brand and by shipping mode (each chart ignores its own pick, so the rest stays visible)
  const countBy = (rows, key) => {
    const m = new Map();
    for (const v of rows) { const kk = key(v) ?? 'Unknown'; m.set(kk, (m.get(kk) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const brands = useMemo(() => countBy(carsOf('brand'), (v) => v.brand), [S, V, f, range.from, range.to, flowAx]);
  // top 15 brands on the chart (plus any picked), all of them in Table view
  const topBrands = [...brands.slice(0, 15), ...brands.slice(15).filter(([b]) => f.brand.includes(b))];
  const brandOpt = useMemo(() => hBars(t, topBrands.map((b) => b[0]), [{ name: 'Cars received', data: topBrands.map((b) => b[1]), color: t.s1 }],
    { catWidth: 130, selected: f.brand, tipExtra: (i) => [{ name: 'Share of received cars', value: pct(topBrands[i][1] / Math.max(1, sum(brands, (b) => b[1])), 1) }] }), [t, brands, f.brand]);
  const modes = useMemo(() => countBy(carsOf('mode'), (v) => shipByNo.get(v.ship)?.mode), [S, V, f, range.from, range.to, flowAx]);
  const modeOpt = useMemo(() => hBars(t, modes.map((m) => m[0]), [{ name: 'Cars received', data: modes.map((m) => m[1]), color: t.s1 }], { selected: f.mode }), [t, modes, f.mode]);

  const modelCars = useMemo(() => carsOf('model'), [S, V, f, range.from, range.to, flowAx]); // cost-by-model charts skip their own pick
  // landed cost status of the received cars (the chart skips its own pick)
  const status = useMemo(() => {
    const rows = carsOf('lcs');
    return { n: rows.length, by: LCS.map((s) => [s, rows.filter((v) => v.lcs === s).length]) };
  }, [S, V, f, range.from, range.to, flowAx]);
  const statusOpt = useMemo(() => hBars(t, status.by.map((s) => s[0]), [{ name: 'Cars received', data: status.by.map((s) => s[1]), color: t.s1 }],
    { catWidth: 170, selected: f.lcs, endText: (i) => `${int(status.by[i][1])} (${pct(status.n ? status.by[i][1] / status.n : 0, 0)})` }), [t, status, f.lcs]);
  const mixCars = useMemo(() => carsOf('lcCat'), [S, V, LC, f, range.from, range.to, flowAx]); // and the distribution skips its cost-type pick

  // completeness for shipments created in the period
  const created = ships.filter((s) => s.created != null && ymMatch(s.created, f.period));
  const fields = [
    ['ETA', (s) => s.eta != null], ['Bill of lading', (s) => s.bl != null],
    ['Port of loading', (s) => s.pol != null], ['Port of discharge', (s) => s.pod != null],
    ['Containers', (s) => s.containers != null],
  ];

  // on the way: open shipments by ETA status, and the model codes on them
  const stages = ['In transit - ETA passed', 'In transit - no ETA', 'In transit - ETA ahead'];
  const stColor = { 'In transit - ETA passed': t.critical, 'In transit - no ETA': t.warn, 'In transit - ETA ahead': t.good };
  const onWay = useMemo(() => {
    const ships2 = new Map(applyPreds(S, shipPreds, 'mcode').filter((s) => s.status === 'In transit').map((s) => [s.no, s]));
    const m = new Map();
    for (const v of V) {
      const sh = v.inTransit ? ships2.get(v.ship) : null;
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
  const codeOpt = useMemo(() => hBars(t, topCodes.map((e) => e.key), stages.map((st, kk) => ({
    name: ETA_LABEL[st], color: stColor[st], data: topCodes.map((e) => [e.passed, e.noEta, e.ahead][kk]),
  })), {
    stacked: true, catWidth: 280, selected: f.mcode,
    tipExtra: (i) => [{ name: 'Model', value: [topCodes[i].brand, topCodes[i].model].filter(Boolean).join(' ') || '-' }, { name: 'Shipments', value: int(topCodes[i].shipN) }],
  }), [t, onWay, f.mcode]);

  const shipCols = [
    { key: 'no', label: 'Shipment' },
    { key: 'pos', label: 'PO #', fmt: (v) => (v || []).join(', '), text: (r) => (r.pos || []).join(', '), wrap: true },
    { key: 'stage', label: 'ETA status', fmt: (v) => <Chip tone={ETA_TONE[v] || 'neutral'}>{ETA_LABEL[v] || v}</Chip>, text: (r) => ETA_LABEL[r.stage] || r.stage },
    { key: 'created', label: 'Created', fmt: date, csv: (r) => date(r.created) },
    { key: 'mainModel', label: 'Main model' },
    { key: 'units', label: 'Cars', align: 'r', fmt: int },
    { key: 'vendors', label: 'Vendor', fmt: (v) => (v || []).join(', '), text: (r) => (r.vendors || []).join(', '), wrap: true },
    { key: 'mode', label: 'Mode' },
    { key: 'bl', label: 'BL' },
    { key: 'pod', label: 'Port of discharge' },
    { key: 'eta', label: 'ETA (expected arrival)', fmt: date, csv: (r) => date(r.eta) },
    { key: 'recv', label: 'Received', fmt: date, csv: (r) => date(r.recv) },
    { key: 'rVsEta', label: 'Receipt vs ETA (d)', align: 'r', fmt: (v) => (v == null ? '-' : int(v)) },
    { key: 'dPoRecv', label: 'PO to receipt (d)', align: 'r', fmt: (v) => (v == null ? '-' : int(v)) },
    { key: 'lcs', label: 'Landed cost' },
  ];
  const tableRows = useMemo(() => [...open, ...received.filter((s) => s.status !== 'In transit')], [open, received]);

  return (
    <>
      <PageHead title="Inbound" sub="Cars received in the selected period - how many, what they cost - and what is still on the way." />
      <FilterBar asOf={asOf} values={f} set={setF} reset={reset} defaults={defaults} filters={[
        { id: 'period', label: 'Receiving date', type: 'yearmonth', years: opts.years },
        { id: 'entity', label: 'Entity', options: opts.entity },
        { id: 'mode', label: 'Shipping mode', options: opts.mode },
        { id: 'route', label: 'Supply route', options: opts.route },
        { id: 'brand', label: 'Brand', options: opts.brand },
      ]} picks={[
        { id: 'recvT', label: 'Received', fmt: flowAx.label },
        { id: 'kpi', label: 'Card', fmt: (id) => KPI_CARDS[id]?.label ?? id }, { id: 'mcode', label: 'Model code' }, { id: 'model', label: 'Model' }, { id: 'lcCat', label: 'Cost type' }, { id: 'lcs', label: 'Landed cost' },
      ]} />
      <div className="kpis">
        <Kpi {...kpiClick(f, set, null)} label="Units received" value={int(k.units)} unit="cars" sub={`${int(k.ships)} shipments`} />
        <Kpi {...kpiClick(f, set, null)} label="Purchase cost" value={aed(k.pp)} sub={aedFull(k.pp)} tone="money" />
        <Kpi {...kpiClick(f, set, null)} label="Landed cost" value={aed(k.lc)} sub={aedFull(k.lc)} tone="money" />
        <Kpi {...kpiClick(f, set, null)} label="Grand total cost" value={aed(k.total)} sub="Purchase + landed cost" tone="money" />
        <Kpi {...kpiClick(f, set, 'posted')} label="Landed cost posted" value={pct(k.units ? k.posted / k.units : null, 0)}
          sub={`${int(k.posted)} of ${int(k.units)} received cars`} />
      </div>
      <div className="grid-2">
        <ChartCard title={`Cars received per ${flow.ax.unit}`} sub={`By receiving date in the yard · receiving dates are recorded from ${isFinite(firstRecv) ? date(firstRecv) : '-'}`} table={flowTable}>
          <EChart option={recOpt} height={300} label="Cars received over time" onPick={pickRecv} />
        </ChartCard>
        <ChartCard title="Days from PO to receipt" sub={`Average per receiving ${flow.ax.unit}`} table={flowTable}>
          <EChart option={leadOpt} height={300} label="Average days from PO to receipt" onPick={pickRecv} />
        </ChartCard>
      </div>
      <div className="grid-2">
        <ChartCard title="Landed cost status" sub={`Cars received in the period · ${int(status.n)} cars`}
          table={{ columns: [{ key: 's', label: 'Landed cost status' }, { key: 'n', label: 'Cars received', align: 'r', fmt: int }], rows: status.by.map(([s, c]) => ({ s, n: c, __key: s })), search: false }}>
          <EChart option={statusOpt} height={rowsHeight(status.by.length, 40)} label="Received cars by landed cost status" onPick={(i) => toggle('lcs', status.by[i][0])} />
        </ChartCard>
        <LandedMix cars={mixCars} LC={LC} selected={f.lcCat} onPick={(c) => toggle('lcCat', c)} what="received cars" />
      </div>
      <div className="grid-2">
        <ChartCard title="Cars received by brand" sub={`Cars received in the period${brands.length > topBrands.length ? ` · top ${topBrands.length} of ${brands.length} brands, switch to Table for all` : ''}`}
          table={{ columns: [{ key: 'b', label: 'Brand' }, { key: 'u', label: 'Cars', align: 'r', fmt: int }], rows: brands.map(([b, u]) => ({ b, u, __key: b })), search: false, csvName: 'received-by-brand' }}>
          {brands.length ? <EChart option={brandOpt} height={rowsHeight(topBrands.length, 28)} label="Cars received by brand" onPick={(i) => toggle('brand', topBrands[i][0])} />
            : <p className="muted" style={{ padding: 12 }}>No cars received for these filters.</p>}
        </ChartCard>
        <ChartCard title="Cars received by shipping mode" sub="Mode taken from the containers field and shipment memo"
          table={{ columns: [{ key: 'm', label: 'Mode' }, { key: 'u', label: 'Cars', align: 'r', fmt: int }], rows: modes.map(([m, u]) => ({ m, u, __key: m })), search: false }}>
          {modes.length ? <EChart option={modeOpt} height={rowsHeight(modes.length, 30)} label="Cars received by shipping mode" onPick={(i) => toggle('mode', modes[i][0])} />
            : <p className="muted" style={{ padding: 12 }}>No cars received for these filters.</p>}
        </ChartCard>
      </div>
      <div className="grid-2">
        <ModelCost cars={modelCars} selected={f.model} onPick={(m) => toggle('model', m)} what="cars received" csvPrefix="received" />
      </div>
      <Card title="Shipment data completeness" sub={`${int(created.length)} shipments created in the period - fields the arrival schedule depends on`}>
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
      {k.late > 0 && (
        <Banner tone="warn" title={`${int(k.late)} of ${int(k.openN)} open shipments have an ETA in the past or none`}>
          The arrival schedule can't be trusted until ETAs are kept current. Update the ETA (and ATA on arrival) on the inbound shipment in NetSuite.
        </Banner>
      )}
      <ChartCard title="Model codes on the way"
        sub={`${int(sum(onWay, (e) => e.n))} cars in transit across ${int(onWay.length)} model codes${onWay.length > topCodes.length ? ` - top ${topCodes.length} shown, switch to Table for all` : ''} · split by the shipment's ETA status`}
        legend={stages.map((st) => ({ name: ETA_LABEL[st], color: stColor[st] }))}
        table={{ columns: [
          { key: 'key', label: 'Model code' }, { key: 'brand', label: 'Brand' }, { key: 'model', label: 'Model' },
          { key: 'n', label: 'Cars', align: 'r', fmt: int }, { key: 'shipN', label: 'Shipments', align: 'r', fmt: int, total: false },
          { key: 'passed', label: 'ETA passed', align: 'r', fmt: int }, { key: 'noEta', label: 'No ETA', align: 'r', fmt: int }, { key: 'ahead', label: 'ETA ahead', align: 'r', fmt: int },
        ], rows: onWay, csvName: 'model-codes-on-the-way' }}>
        {codesMissing ? <p className="muted" style={{ padding: 12 }}>This dataset was saved before model codes were kept - run NetSuite Data Sync (or upload the export) again to see them.</p>
          : onWay.length ? <EChart option={codeOpt} height={rowsHeight(topCodes.length, 26)} label="Model codes on the way" onPick={(i) => toggle('mcode', topCodes[i].key === NO_CODE ? null : topCodes[i].key)} />
            : <p className="muted" style={{ padding: 12 }}>No cars on the way for these filters.</p>}
      </ChartCard>
      <Card title="Shipments" sub="On the way first, then shipments received in the period. Search by shipment or PO number.">
        <DataTable columns={shipCols} rows={tableRows} csvName="inbound-shipments" searchPlaceholder="Search by shipment or PO #" />
      </Card>
    </>
  );
}
