import { useMemo } from 'react';
import { useData } from '../context.js';
import { useChartTheme } from '../theme.js';
import { useFilters, ymMatch, ymRange, matchAny, pick, applyPreds, kpiClick, kpiPred, sum, avg, options } from '../data/metrics.js';
import FilterBar from '../components/FilterBar.jsx';
import EChart from '../components/EChart.jsx';
import DataTable from '../components/DataTable.jsx';
import { hBars, columns, rowsHeight } from '../components/charts.js';
import { Kpi, ChartCard, Banner, Card, Chip } from '../components/ui.jsx';
import { PageHead, timeAxis, clampRange, dayLabel } from './common.jsx';
import { int, aed, aedFull, pct, date, compact, yearOf, monthKey, monthLabel } from '../format.js';

// table order: partly received first, then in transit, then the rest
const STATUS_RANK = {
  'Partly received - balance in transit': 0, 'In transit - nothing received yet': 1,
  'Received - PO value not fully carded': 2, 'Fully received': 3,
};
const STATUS_TONE = {
  'Fully received': 'good', 'Partly received - balance in transit': 'brand',
  'In transit - nothing received yet': 'warn', 'Received - PO value not fully carded': 'neutral',
};

// KPI cards that stand for a subset of POs: clicking one filters the page to it
const KPI_CARDS = {
  received: { label: 'POs with cars received', test: (p) => p.received > 0 },
  notCarded: { label: 'PO value not yet on cards', test: (p) => p.notCarded > 0 },
  open: { label: 'Open POs', test: (p) => p.isOpen === 'Y' },
};

export default function PurchaseOrders() {
  const { ds } = useData();
  const t = useChartTheme();
  const { P, meta } = ds;
  const asOf = meta.asOf;
  // month / po are chart-click selections (no dropdown)
  const defaults = { period: [String(yearOf(asOf))], entity: [], vendor: [], route: [], status: [], brand: [], month: [], po: [], kpi: [] };
  const [f, set, reset, toggle] = useFilters(defaults);
  const setF = (id, v) => { set(id, v); if (id === 'period') set('month', []); }; // a month picked on a chart may fall outside the new period

  const opts = useMemo(() => ({
    entity: options(P, (p) => p.entity, { sortBy: 'name' }),
    vendor: options(P, (p) => p.vendor),
    route: options(P, (p) => p.route),
    status: Object.keys(STATUS_RANK),
    brand: options(P.flatMap((p) => p.brands || []), (b) => b),
    years: [...new Set([yearOf(asOf), ...P.map((p) => yearOf(p.date)).filter((y) => y != null)])].sort((a, b) => b - a),
  }), [P, asOf]);

  const range = ymRange(f.period);
  const preds = {
    entity: pick(f.entity, (p) => p.entity), vendor: pick(f.vendor, (p) => p.vendor), route: pick(f.route, (p) => p.route),
    brand: f.brand.length ? (p) => matchAny(p.brands, f.brand) : null, status: pick(f.status, (p) => p.status),
    month: pick(f.month, (p) => monthKey(p.date)), po: pick(f.po, (p) => p.no), kpi: kpiPred(f, KPI_CARDS),
  };
  // POs dated in the PO-date filter, every selection applied except `skip` (a chart's own dimension)
  const inPeriod = (skip) => applyPreds(P, preds, skip).filter((p) => ymMatch(p.date, f.period));
  const pos = useMemo(() => inPeriod(), [P, f]);
  const posByDate = useMemo(() => [...pos].sort((a, b) => (b.date ?? -1e9) - (a.date ?? -1e9)), [pos]);
  const openAll = useMemo(() => applyPreds(P, preds).filter((p) => p.isOpen !== 'N'), [P, f]);

  const k = useMemo(() => {
    const open = openAll.filter((p) => p.isOpen === 'Y');
    const withPay = pos.filter((p) => p.payCheck !== 'No payment data');
    return {
      n: pos.length, value: sum(pos, (p) => p.totalAED), carded: sum(pos, (p) => p.carded), received: sum(pos, (p) => p.received),
      transit: sum(pos, (p) => p.inTransit), notCarded: sum(pos, (p) => p.notCarded),
      openN: open.length, check: openAll.filter((p) => p.isOpen === 'Check').length, openDays: avg(open, (p) => p.daysSince),
      overdue: open.filter((p) => p.overdue).length, openTransit: sum(open, (p) => p.inTransit),
      payN: withPay.length, paid: sum(withPay, (p) => p.paidAED), balance: sum(withPay, (p) => p.balanceAED),
      inconsistent: withPay.filter((p) => p.payCheck !== 'OK').length,
      fromBills: pos.some((p) => p.paySource === 'bills'), unpaid: sum(withPay, (p) => p.unpaidAED),
    };
  }, [pos, openAll]);

  // ---- monthly
  const monthly = useMemo(() => {
    const rows = inPeriod('month');
    const r = clampRange(range, rows, (p) => p.date, asOf);
    const ax = timeAxis(r.from, r.to, 'month');
    const idx = new Map(ax.keys.map((x, i) => [x, i]));
    const z = () => ax.keys.map(() => 0);
    const m = { count: z(), value: z(), carded: z(), received: z(), transit: z() };
    for (const p of rows) {
      const i = idx.get(ax.keyOf(p.date));
      if (i == null) continue;
      m.count[i]++; m.value[i] += p.totalAED || 0; m.carded[i] += p.carded; m.received[i] += p.received; m.transit[i] += p.inTransit;
    }
    return { ax, ...m };
  }, [P, f, range.from, range.to, asOf]);
  const pickMonth = (i) => toggle('month', monthly.ax.keys[i]);

  const carsOpt = useMemo(() => columns(t, monthly.ax.keys, [
    { name: 'Received', data: monthly.received, color: t.s1 },
    { name: 'In transit', data: monthly.transit, color: t.s2 },
  ], { stacked: true, xFmt: monthly.ax.label, selected: f.month, tipExtra: (i) => [{ name: 'POs issued', value: int(monthly.count[i]) }] }), [t, monthly, f.month]);
  const valueOpt = useMemo(() => columns(t, monthly.ax.keys, [{ name: 'PO value (AED)', data: monthly.value, color: t.s1 }],
    { xFmt: monthly.ax.label, fmt: compact, selected: f.month, tipExtra: (i) => [{ name: 'POs issued', value: int(monthly.count[i]) }] }), [t, monthly, f.month]);
  const monthTable = {
    columns: [
      { key: 'm', label: 'Month' }, { key: 'count', label: 'POs', align: 'r', fmt: int }, { key: 'value', label: 'PO value (AED)', align: 'r', fmt: int },
      { key: 'carded', label: 'Cars carded', align: 'r', fmt: int }, { key: 'received', label: 'Received', align: 'r', fmt: int },
      { key: 'transit', label: 'In transit', align: 'r', fmt: int },
    ],
    rows: monthly.ax.keys.map((key, i) => ({ __key: key, m: monthly.ax.label(key), count: monthly.count[i], value: monthly.value[i], carded: monthly.carded[i], received: monthly.received[i], transit: monthly.transit[i] })),
    search: false, csvName: 'po-by-month',
  };

  // ---- open POs
  const openList = useMemo(() => applyPreds(P, preds, 'po').filter((p) => p.isOpen === 'Y').sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0)), [P, f]);
  const openOpt = useMemo(() => hBars(t, openList.map((p) => p.no), [
    { name: 'Received', data: openList.map((p) => p.received), color: t.s1 },
    { name: 'In transit', data: openList.map((p) => p.inTransit), color: t.s2 },
  ], {
    stacked: true, catWidth: 170, endText: (i) => dayLabel(openList[i].daysSince), selected: f.po,
    tipExtra: (i) => [{ name: 'Days since PO', value: int(openList[i].daysSince) }, { name: 'Receive by', value: date(openList[i].receiveBy) }],
    tipFoot: (i) => openList[i].vendor,
  }), [t, openList, f.po]);

  // ---- vendors
  const vendors = useMemo(() => {
    const m = new Map();
    for (const p of inPeriod('vendor')) {
      const e = m.get(p.vendor) || { vendor: p.vendor, pos: 0, value: 0, carded: 0, received: 0, transit: 0 };
      e.pos++; e.value += p.totalAED || 0; e.carded += p.carded; e.received += p.received; e.transit += p.inTransit;
      m.set(p.vendor, e);
    }
    return [...m.values()].sort((a, b) => b.value - a.value);
  }, [P, f]);
  // keep picked vendors on the chart even when they fall outside the top 12
  const topV = useMemo(() => [...vendors.slice(0, 12), ...vendors.slice(12).filter((v) => f.vendor.includes(v.vendor))], [vendors, f.vendor]);
  const vendorOpt = useMemo(() => hBars(t, topV.map((v) => v.vendor), [{ name: 'PO value (AED)', data: topV.map((v) => v.value), color: t.s1 }],
    { fmt: compact, catWidth: 190, selected: f.vendor, tipExtra: (i) => [{ name: 'POs', value: int(topV[i].pos) }, { name: 'Cars carded', value: int(topV[i].carded) }] }), [t, topV, f.vendor]);

  const paidShare = k.paid + k.balance > 0 ? k.paid / (k.paid + k.balance) : null;

  const poCols = [
    { key: 'no', label: 'PO #' },
    { key: 'date', label: 'PO date', fmt: date, csv: (r) => date(r.date) },
    { key: 'vendor', label: 'Vendor', wrap: true },
    { key: 'entity', label: 'Entity' },
    { key: 'route', label: 'Supply route', fmt: (v) => (v || '').replace(/ \(.*\)/, '') },
    { key: 'ccy', label: 'Ccy' },
    { key: 'totalAED', label: 'PO value (AED)', align: 'r', fmt: int },
    { key: 'carded', label: 'Cars', align: 'r', fmt: int },
    { key: 'received', label: 'Received', align: 'r', fmt: int },
    { key: 'inTransit', label: 'In transit', align: 'r', fmt: int },
    { key: 'notCarded', label: 'Not yet on cards (AED)', align: 'r', fmt: (v) => (v ? int(v) : '-') },
    { key: 'status', label: 'Status', fmt: (v) => <Chip tone={STATUS_TONE[v] || 'neutral'} icon={false}>{v}</Chip>, text: (r) => r.status, sort: (r) => STATUS_RANK[r.status] ?? 9 },
    { key: 'daysSince', label: 'Days since PO', align: 'r', fmt: int },
    { key: 'receiveBy', label: 'Receive by', fmt: (v, r) => (r.overdue ? <Chip tone="critical">{date(v)}</Chip> : date(v)), csv: (r) => date(r.receiveBy) },
    { key: 'paidPct', label: 'Paid', align: 'r', fmt: (v, r) => (r.payCheck === 'No payment data' ? '-' : pct(v, 0)), csv: (r) => (r.paidPct == null ? '' : (r.paidPct * 100).toFixed(1)) },
    { key: 'approval', label: 'Approval' },
  ];

  return (
    <>
      <PageHead title="Purchase Orders" sub="What we have committed to, how much of it has arrived, and what is still on the way or unpaid." />
      <FilterBar asOf={asOf} values={f} set={setF} reset={reset} defaults={defaults} filters={[
        { id: 'period', label: 'PO date', type: 'yearmonth', years: opts.years },
        { id: 'entity', label: 'Entity', options: opts.entity },
        { id: 'vendor', label: 'Vendor', options: opts.vendor },
        { id: 'route', label: 'Supply route', options: opts.route },
        { id: 'status', label: 'PO status', options: opts.status },
        { id: 'brand', label: 'Brand', options: opts.brand },
      ]} picks={[{ id: 'month', label: 'PO month', fmt: monthLabel }, { id: 'po', label: 'PO' }, { id: 'kpi', label: 'Card', fmt: (id) => KPI_CARDS[id]?.label ?? id }]} />
      <div className="kpis">
        <Kpi {...kpiClick(f, set, null)} label="POs issued" value={int(k.n)} sub={`${int(k.openN)} open · ${int(k.check)} to check`} />
        <Kpi {...kpiClick(f, set, null)} label="PO value" value={aed(k.value)} sub={aedFull(k.value)} tone="money" />
        <Kpi {...kpiClick(f, set, null)} label="Cars on these POs" value={int(k.carded)} sub={`${int(k.received)} received · ${int(k.transit)} in transit`} />
        <Kpi {...kpiClick(f, set, 'received')} label="Received" value={pct(k.carded ? k.received / k.carded : null)} sub={`${int(k.received)} of ${int(k.carded)} cars`} />
        <Kpi {...kpiClick(f, set, 'notCarded')} label="Not yet on cards (est.)" value={aed(k.notCarded)} sub="PO value not yet shipped or carded" tone="money" />
        <Kpi {...kpiClick(f, set, 'open')} label="Open POs" value={int(k.openN)} sub={`${int(k.openTransit)} cars in transit · avg ${dayLabel(k.openDays)} old`}
          chip={k.overdue ? <Chip tone="critical">{int(k.overdue)} past Receive-By</Chip> : null} />
      </div>
      <Banner tone="info" title="Cars that are ordered but not yet shipped are not counted as cars yet">
        NetSuite creates a vehicle card (with its chassis number) only when a car is shipped, and every car count on this page comes from those cards.
        "Not yet on cards" shows the rest in money: each PO's value minus the purchase price of the cars already carded against it (VAT taken out on AED POs).
        Example: a PO worth AED 1,000,000 with 6 cars carded at AED 100,000 each shows AED 400,000 not yet on cards - about 4 cars still to ship.
      </Banner>
      <div className="grid-2">
        <ChartCard title="Cars on POs, by PO month" sub="Received vs still in transit" table={monthTable}
          legend={[{ name: 'Received', color: t.s1 }, { name: 'In transit', color: t.s2 }]}>
          <EChart option={carsOpt} height={300} label="Cars on purchase orders by PO month" onPick={pickMonth} />
        </ChartCard>
        <ChartCard title="PO value by month" sub="PO total converted to AED at the PO exchange rate" table={monthTable}>
          <EChart option={valueOpt} height={300} label="PO value by month" onPick={pickMonth} />
        </ChartCard>
      </div>
      <div className="grid-2">
        <ChartCard title="Open POs" sub={`${openList.length} POs with cars still in transit, any PO date · bar end = days since PO`}
          legend={[{ name: 'Received', color: t.s1 }, { name: 'In transit', color: t.s2 }]}
          table={{ columns: poCols.filter((c) => ['no', 'date', 'vendor', 'carded', 'received', 'inTransit', 'daysSince', 'receiveBy'].includes(c.key)), rows: openList, csvName: 'open-pos', search: false }}>
          <EChart option={openOpt} height={rowsHeight(openList.length, 26)} label="Open purchase orders" onPick={(i) => toggle('po', openList[i].no)} />
        </ChartCard>
        <ChartCard title="Top vendors by PO value" sub="POs in the selected period"
          table={{ columns: [
            { key: 'vendor', label: 'Vendor', wrap: true }, { key: 'pos', label: 'POs', align: 'r', fmt: int },
            { key: 'value', label: 'PO value (AED)', align: 'r', fmt: int }, { key: 'carded', label: 'Cars', align: 'r', fmt: int },
            { key: 'received', label: 'Received', align: 'r', fmt: int }, { key: 'transit', label: 'In transit', align: 'r', fmt: int },
          ], rows: vendors.map((v) => ({ ...v, __key: v.vendor })), csvName: 'vendors' }}>
          <EChart option={vendorOpt} height={rowsHeight(topV.length, 28)} label="Top vendors by PO value" onPick={(i) => toggle('vendor', topV[i].vendor)} />
        </ChartCard>
      </div>
      <Card title="Payments against these POs" sub={k.fromBills
        ? `All ${int(k.n)} POs in the filter, from the vendor bills in NetSuite · paid = bill payments, balance = PO value not yet paid`
        : `Based on ${int(k.payN)} of ${int(k.n)} POs that carry the PO payment fields (filled in NetSuite only from mid-2026) - run NetSuite Data Sync to use the vendor bills for every PO`}>
        <div style={{ padding: '6px 6px 4px', display: 'grid', gap: 10 }}>
          <div className="meter" style={{ height: 12 }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={paidShare != null ? Math.round(paidShare * 100) : 0} aria-label="Share paid">
            <i style={{ width: `${(paidShare || 0) * 100}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span><b className="num">{aed(k.paid)}</b> <span className="muted">paid ({pct(paidShare, 0)})</span></span>
            <span><b className="num">{aed(k.balance)}</b> <span className="muted">balance to pay</span></span>
          </div>
          {k.fromBills && k.balance > 0 && (
            <span className="muted" style={{ fontSize: 12.5 }}>
              Of the balance: <b className="num">{aed(k.unpaid)}</b> billed, not yet paid · <b className="num">{aed(Math.max(0, k.balance - k.unpaid))}</b> not yet billed
            </span>
          )}
          {k.inconsistent > 0 && <Chip tone="warn">{int(k.inconsistent)} POs where paid + balance differ from the PO total</Chip>}
        </div>
      </Card>
      <Card title="Purchase orders" sub="Partly received first, then in transit, then the rest (newest first within each). Click a column to sort; dates and amounts download as shown.">
        <DataTable columns={poCols} rows={posByDate} csvName="purchase-orders" initialSort={{ key: 'status', dir: 1 }}
          filters={[{ key: 'status', label: 'Status', options: opts.status }]} />
      </Card>
    </>
  );
}
