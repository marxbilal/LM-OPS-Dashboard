import { useData } from '../context.js';
import { date, monthKey, monthLabel, weekStart, addMonths, monthStart } from '../format.js';
import { DAY } from '../data/pipeline.js';

export function PageHead({ title, sub }) {
  const { ds, source } = useData();
  const local = source === 'local' || source === 'snapshot';
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {ds && (
        <span className={`asof ${local ? 'local' : ''}`} title={local ? 'Saved in this browser only' : 'Shared dataset'}>
          <i aria-hidden="true" />Data as of {date(ds.meta.asOf)}
        </span>
      )}
    </div>
  );
}

/** Time buckets for a chart: months for long ranges, ISO weeks for short ones. */
export function timeAxis(from, to, prefer) {
  const span = to - from;
  const unit = prefer || (span <= 70 ? 'week' : 'month');
  const keys = [];
  if (unit === 'month') {
    for (let d = monthStart(from); d <= to; d = addMonths(d, 1)) keys.push(monthKey(d));
    return { unit, keys, keyOf: (d) => monthKey(d), label: monthLabel };
  }
  if (unit === 'day') {
    for (let d = from; d <= to; d++) keys.push(d);
    return { unit, keys, keyOf: (d) => d, label: (k) => date(k).slice(0, 6) };
  }
  for (let d = weekStart(from); d <= to; d += 7) keys.push(d);
  return { unit, keys, keyOf: (d) => weekStart(d), label: weekLabel };
}

/**
 * "Week 2 Jan 26": weeks run Monday to Sunday and belong to the month their Thursday falls in, numbered from 1 within
 * that month (so a month with five Thursdays has a Week 5).
 */
export function weekLabel(monday) {
  const thu = Number(monday) + 3; // chart axes pass the category as text
  return `Week ${Math.floor((new Date(thu * DAY).getUTCDate() - 1) / 7) + 1} ${monthLabel(monthKey(thu))}`;
}

export function clampRange(r, rows, f, asOf) {
  let from = r.from, to = Math.min(r.to, asOf);
  if (from < -1e5) {
    let m = Infinity;
    for (const x of rows) { const d = f(x); if (d != null && d < m) m = d; }
    from = isFinite(m) ? m : asOf - 365;
  }
  return { from, to };
}

export const dayLabel = (n) => (n == null ? '-' : `${Math.round(n)} d`);
export const yearOfDay = (d) => (d == null ? null : new Date(d * DAY).getUTCFullYear());

/** Status chip tone for an inbound shipment stage. */
export const ETA_TONE = { 'In transit - ETA passed': 'critical', 'In transit - no ETA': 'warn', 'In transit - ETA ahead': 'good', Received: 'neutral' };
export const ETA_LABEL = { 'In transit - ETA passed': 'ETA passed', 'In transit - no ETA': 'No ETA', 'In transit - ETA ahead': 'ETA ahead', Received: 'Received' };
