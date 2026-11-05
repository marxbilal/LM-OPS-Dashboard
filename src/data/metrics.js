import { useState } from 'react';
import { monthStart, addMonths, yearOf, monthKey } from '../format.js';
import { DAY } from './pipeline.js';

export function periodOptions(asOf) {
  const fy = yearOf(asOf);
  return [
    { value: 'ytd', label: `${fy} to date` },
    { value: 'this-month', label: 'This month' },
    { value: 'last-month', label: 'Last month' },
    { value: 'last-30', label: 'Last 30 days' },
    { value: 'last-90', label: 'Last 90 days' },
    { value: 'last-12m', label: 'Last 12 months' },
    { value: 'prev-year', label: String(fy - 1) },
    { value: 'all', label: 'All time' },
    { value: 'custom', label: 'Custom range' },
  ];
}

/** Inclusive day range for a period preset. */
export function periodRange(p, asOf, from, to) {
  const fy = yearOf(asOf);
  const jan1 = (y) => Math.floor(Date.UTC(y, 0, 1) / DAY);
  switch (p) {
    case 'this-month': return { from: monthStart(asOf), to: asOf };
    case 'last-month': return { from: addMonths(asOf, -1), to: monthStart(asOf) - 1 };
    case 'last-30': return { from: asOf - 29, to: asOf };
    case 'last-90': return { from: asOf - 89, to: asOf };
    case 'last-12m': return { from: addMonths(asOf, -11), to: asOf };
    case 'prev-year': return { from: jan1(fy - 1), to: jan1(fy) - 1 };
    case 'all': return { from: -1e6, to: 1e6 };
    case 'custom': return { from: from ?? -1e6, to: to ?? 1e6 };
    case 'ytd':
    default: return { from: jan1(fy), to: asOf };
  }
}
export const within = (d, r) => d != null && d >= r.from && d <= r.to;

/** Year & month picks: ['2026', '2025-03', ...] - a bare year means the whole year; empty means all time. */
export function ymMatch(d, sel) {
  if (!sel?.length) return true;
  const k = monthKey(d);
  return k != null && (sel.includes(k.slice(0, 4)) || sel.includes(k));
}
/** Smallest day range covering the picks, for chart axes. */
export function ymRange(sel) {
  if (!sel?.length) return { from: -1e6, to: 1e6 };
  let from = Infinity, to = -Infinity;
  for (const s of sel) {
    const [y, m] = s.split('-').map(Number);
    const a = Math.floor(Date.UTC(y, m ? m - 1 : 0, 1) / DAY);
    const b = Math.floor(Date.UTC(m ? y : y + 1, m ? m : 0, 1) / DAY) - 1;
    if (a < from) from = a;
    if (b > to) to = b;
  }
  return { from, to };
}

export function sum(rows, f) { let s = 0; for (const r of rows) { const v = f(r); if (v != null && !isNaN(v)) s += v; } return s; }
export function avg(rows, f) {
  let s = 0, n = 0;
  for (const r of rows) { const v = f(r); if (v != null && !isNaN(v)) { s += v; n++; } }
  return n ? s / n : null;
}
export function count(rows, f) { let n = 0; for (const r of rows) if (f(r)) n++; return n; }
export function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (k == null) continue;
    let a = m.get(k);
    if (!a) { a = []; m.set(k, a); }
    a.push(r);
  }
  return m;
}
export function countBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) { const k = keyFn(r); m.set(k, (m.get(k) || 0) + 1); }
  return m;
}
export function options(rows, f, { sortBy = 'count' } = {}) {
  const m = countBy(rows, f);
  m.delete(null); m.delete(undefined); m.delete('');
  const e = [...m.entries()];
  e.sort(sortBy === 'count' ? (a, b) => b[1] - a[1] : (a, b) => String(a[0]).localeCompare(String(b[0])));
  return e.map(([k]) => k);
}

/** Filter state for a page; [] (or '') means All, a list means any of those values. */
export function useFilters(defaults) {
  const [f, setF] = useState(defaults);
  const set = (id, v) => setF((prev) => ({ ...prev, [id]: v }));
  const reset = () => setF(defaults);
  /** Chart click: add the value(s) to a list filter, or take them out if already picked. */
  const toggle = (id, v) => {
    const vs = (Array.isArray(v) ? v : [v]).filter((x) => x != null);
    if (!vs.length) return;
    setF((prev) => {
      const cur = prev[id] || [];
      const on = vs.some((x) => cur.includes(x));
      return { ...prev, [id]: on ? cur.filter((x) => !vs.includes(x)) : [...cur, ...vs] };
    });
  };
  return [f, set, reset, toggle];
}

/**
 * KPI card click: filter the page to that card's subset, one card at a time (f.kpi = [id]).
 * A page-total card (id null) only clears the card selection. Spread the result into <Kpi>.
 */
export const kpiClick = (f, set, id) => ({
  active: id != null && f.kpi?.[0] === id,
  onClick: () => set('kpi', id == null || f.kpi?.[0] === id ? [] : [id]),
});
/** Predicate for the picked KPI card, from a page's { id: { label, test } } map. */
export const kpiPred = (f, cards) => (f.kpi?.length && cards[f.kpi[0]] ? cards[f.kpi[0]].test : null);

/** Predicate for a list filter, or null when nothing is picked (skipped by applyPreds). */
export const pick = (sel, get) => (sel?.length ? (r) => sel.includes(get(r)) : null);
/** Rows passing every predicate except the skipped ones - a chart ignores its own selection so it can show the rest dimmed. */
export function applyPreds(rows, preds, skip = []) {
  const sk = Array.isArray(skip) ? skip : [skip];
  const ps = Object.entries(preds).filter(([k, p]) => p && !sk.includes(k)).map(([, p]) => p);
  return ps.length ? rows.filter((r) => ps.every((p) => p(r))) : rows;
}
export const match = (v, sel) => (Array.isArray(sel) ? !sel.length || sel.includes(v) : !sel || v === sel);
/** For records that carry several values (a shipment's brands): any of them picked. */
export const matchAny = (list, sel) => !sel?.length || (list || []).some((x) => sel.includes(x));
