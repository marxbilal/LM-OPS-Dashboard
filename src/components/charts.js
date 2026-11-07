// ECharts option builders that follow the house chart rules: one axis, thin bars with a
// 4px rounded data end, 2px surface gaps in stacks, hairline grid, text in ink tokens.
import { esc, compact, int } from '../format.js';

const axis = (t) => ({
  axisLine: { lineStyle: { color: t.axis } },
  axisTick: { show: false },
  axisLabel: { color: t.muted, fontFamily: t.fontUi, fontSize: 11.5 },
  splitLine: { lineStyle: { color: t.grid, width: 1, type: 'solid' } },
});

const tooltip = (t, extra = {}) => ({
  backgroundColor: t.surface, borderColor: t.line2, borderWidth: 1, padding: [8, 11],
  textStyle: { color: t.ink, fontFamily: t.fontUi, fontSize: 12.5 },
  extraCssText: 'box-shadow:0 8px 22px rgba(0,0,0,.14);border-radius:8px;',
  confine: true,
  ...extra,
});

/** Chart click selection: categories not picked are drawn faded (opts.selected = picked category values). */
const dimmer = (cats, selected) => {
  const sel = selected?.length ? new Set(selected) : null;
  return (data) => (sel ? data.map((v, i) => (sel.has(cats[i]) ? v : { value: v, itemStyle: { opacity: 0.28 }, label: { opacity: 0.5 } })) : data);
};

export function tipHTML(t, title, rows, foot) {
  const head = `<div style="font-weight:700;margin-bottom:5px;max-width:260px;white-space:normal">${esc(title)}</div>`;
  const body = rows.map((r) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:14px;line-height:1.7">
    <span style="display:inline-flex;align-items:center;gap:7px;color:${t.ink2}">${r.color ? `<i style="display:inline-block;width:12px;height:3px;border-radius:2px;background:${r.color}"></i>` : ''}${esc(r.name)}</span>
    <b style="font-variant-numeric:tabular-nums;color:${t.ink}">${esc(r.value)}</b></div>`).join('');
  const f = foot ? `<div style="margin-top:5px;color:${t.muted};font-size:11.5px;max-width:260px;white-space:normal">${esc(foot)}</div>` : '';
  return head + body + f;
}

/**
 * Horizontal bars. series: [{ name, data:number[], color }]
 * opts: stacked, fmt (value -> string), endLabel (bool), tipExtra(i) -> rows, tipFoot(i), catWidth, selected
 */
export function hBars(t, cats, series, opts = {}) {
  const { stacked = false, fmt = int, endLabel = true, tipExtra, tipFoot, catWidth = 150, axisFmt = compact, endText, catFmt, selected } = opts;
  const last = series.length - 1;
  const totals = cats.map((_, i) => series.reduce((a, s) => a + (s.data[i] || 0), 0));
  const dim = dimmer(cats, selected);
  const endLen = endLabel ? Math.max(0, ...cats.map((_, i) => String(endText ? endText(i) : fmt(totals[i])).length)) : 0;
  return {
    animationDuration: 250,
    grid: { left: 6, right: endLabel ? Math.min(180, Math.max(46, Math.round(endLen * 7.5) + 14)) : 18, top: 6, bottom: 4, containLabel: true },
    xAxis: { type: 'value', ...axis(t), axisLine: { show: false }, axisLabel: { ...axis(t).axisLabel, formatter: (v) => axisFmt(v) } },
    yAxis: {
      type: 'category', data: cats, inverse: true, ...axis(t), splitLine: { show: false }, triggerEvent: true,
      axisLabel: { color: t.ink, fontFamily: t.fontUi, fontSize: 12, fontWeight: 600, width: catWidth, overflow: 'truncate', formatter: catFmt },
    },
    tooltip: tooltip(t, {
      trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: t.grid, opacity: 0.6 } },
      formatter: (ps) => {
        const i = ps[0].dataIndex;
        const rows = series.length > 1
          ? series.map((s) => ({ name: s.name, value: fmt(s.data[i]), color: s.color }))
          : [{ name: series[0].name, value: fmt(series[0].data[i]), color: series[0].color }];
        if (stacked && series.length > 1) rows.push({ name: 'Total', value: fmt(totals[i]) });
        return tipHTML(t, cats[i], rows.concat(tipExtra ? tipExtra(i) : []), tipFoot?.(i));
      },
    }),
    series: series.map((s, k) => ({
      type: 'bar', name: s.name, data: dim(s.data), stack: stacked ? 'a' : undefined,
      barMaxWidth: 20, barCategoryGap: '38%',
      itemStyle: { color: s.color, borderRadius: !stacked || k === last ? [0, 4, 4, 0] : 0, borderColor: t.surface, borderWidth: stacked ? 1 : 0 },
      emphasis: { itemStyle: { opacity: 0.85 } },
      label: endLabel && (!stacked || k === last) ? {
        show: true, position: 'right', color: t.ink, fontFamily: t.fontUi, fontSize: 12, fontWeight: 700,
        formatter: (p) => (endText ? endText(p.dataIndex) : fmt(stacked ? totals[p.dataIndex] : p.value)),
      } : { show: false },
    })),
  };
}

/** Vertical columns. opts: stacked, fmt, capLabels (bool, default on - labels that would overlap are skipped), xFmt, tipExtra, tipFoot, selected */
export function columns(t, cats, series, opts = {}) {
  const { stacked = false, fmt = int, capLabels = true, xFmt = (x) => x, tipExtra, tipFoot, axisFmt = compact, rotate = 0, selected } = opts;
  const last = series.length - 1;
  const totals = cats.map((_, i) => series.reduce((a, s) => a + (s.data[i] || 0), 0));
  const dim = dimmer(cats, selected);
  return {
    animationDuration: 250,
    grid: { left: 6, right: 12, top: capLabels ? 24 : 12, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: cats, ...axis(t), splitLine: { show: false }, triggerEvent: true, axisLabel: { ...axis(t).axisLabel, formatter: xFmt, rotate, hideOverlap: true } },
    yAxis: { type: 'value', ...axis(t), axisLine: { show: false }, axisLabel: { ...axis(t).axisLabel, formatter: (v) => axisFmt(v) } },
    tooltip: tooltip(t, {
      trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: t.grid, opacity: 0.6 } },
      formatter: (ps) => {
        const i = ps[0].dataIndex;
        const rows = series.map((s) => ({ name: s.name, value: fmt(s.data[i]), color: s.color }));
        if (stacked && series.length > 1) rows.push({ name: 'Total', value: fmt(totals[i]) });
        return tipHTML(t, xFmt(cats[i]), rows.concat(tipExtra ? tipExtra(i) : []), tipFoot?.(i));
      },
    }),
    series: series.map((s, k) => ({
      type: 'bar', name: s.name, data: dim(s.data), stack: stacked ? 'a' : undefined,
      barMaxWidth: 40, barCategoryGap: '26%', barGap: '12%',
      itemStyle: { color: s.color, borderRadius: !stacked || k === last ? [4, 4, 0, 0] : 0, borderColor: t.surface, borderWidth: stacked ? 1 : 0 },
      emphasis: { itemStyle: { opacity: 0.85 } },
      labelLayout: { hideOverlap: true },
      label: capLabels && (!stacked ? series.length === 1 : k === last) ? {
        show: true, position: 'top', color: t.ink, fontFamily: t.fontUi, fontSize: 12, fontWeight: 700,
        formatter: (p) => fmt(stacked ? totals[p.dataIndex] : p.value),
      } : { show: false },
    })),
  };
}

/** Line chart, one axis. series: [{ name, data, color }]. opts: fmt, area, xFmt, endLabel, yMin, selected (picked points drawn larger) */
export function lines(t, cats, series, opts = {}) {
  const { fmt = int, area = series.length === 1, xFmt = (x) => x, endLabel = true, yMin, axisFmt = compact, tipFoot, selected } = opts;
  const sel = selected?.length ? new Set(selected) : null;
  const mark = (data) => (sel ? data.map((v, i) => (sel.has(cats[i]) ? { value: v, symbolSize: 13 } : { value: v, itemStyle: { opacity: 0.45 } })) : data);
  return {
    animationDuration: 250,
    grid: { left: 6, right: endLabel ? 46 : 14, top: 16, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: cats, boundaryGap: false, ...axis(t), splitLine: { show: false }, triggerEvent: true, axisLabel: { ...axis(t).axisLabel, formatter: xFmt, hideOverlap: true } },
    yAxis: { type: 'value', min: yMin, ...axis(t), axisLine: { show: false }, axisLabel: { ...axis(t).axisLabel, formatter: (v) => axisFmt(v) } },
    tooltip: tooltip(t, {
      trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: t.muted, width: 1 } },
      formatter: (ps) => {
        const i = ps[0].dataIndex;
        return tipHTML(t, xFmt(cats[i]), series.map((s) => ({ name: s.name, value: fmt(s.data[i]), color: s.color })), tipFoot?.(i));
      },
    }),
    series: series.map((s) => ({
      type: 'line', name: s.name, data: mark(s.data), smooth: false, connectNulls: false,
      lineStyle: { width: 2, color: s.color, cap: 'round', join: 'round' },
      itemStyle: { color: s.color, borderColor: t.surface, borderWidth: 2 },
      symbol: 'circle', symbolSize: 8, showSymbol: true,
      areaStyle: area ? { color: s.color, opacity: 0.1 } : undefined,
      endLabel: endLabel ? { show: true, color: t.ink, fontFamily: t.fontUi, fontSize: 12, fontWeight: 700, formatter: (p) => fmt(p.value) } : undefined,
      emphasis: { focus: 'none' },
    })),
  };
}

export const rowsHeight = (n, per = 30, min = 120) => Math.max(min, n * per + 24);
