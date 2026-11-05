import { useEffect, useRef, useState } from 'react';
import { periodOptions } from '../data/metrics.js';
import { isoDate, dayFromISO } from '../format.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');

/** Open state for a filter pop-over that closes on a click outside or Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return [open, setOpen, ref];
}

/** Searchable checklist; value is the list of picked values, [] = all. */
function MultiSelect({ id, label, value = [], options, allLabel = 'All', onChange, active }) {
  const [open, setOpen, ref] = usePopover();
  const [q, setQ] = useState('');
  const sel = new Set(value);
  const labelOf = (v) => options.find((o) => o.value === v)?.label ?? v;
  const needle = q.trim().toLowerCase();
  const shown = needle ? options.filter((o) => String(o.label).toLowerCase().includes(needle)) : options;
  const toggle = (v) => onChange(sel.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  const summary = !value.length ? allLabel : value.length === 1 ? labelOf(value[0]) : `${value.length} selected`;

  return (
    <div className={`field ym ${active ? 'active' : ''}`} ref={ref}>
      <label htmlFor={id}>{label}</label>
      <button type="button" id={id} className="ym-trigger" aria-haspopup="true" aria-expanded={open} title={value.length > 1 ? value.map(labelOf).join(', ') : undefined}
        onClick={() => { setOpen((o) => !o); setQ(''); }}>{summary}</button>
      {open && (
        <div className="ym-pop" role="group" aria-label={label}>
          <div className="ms-search">
            <input type="search" placeholder="Search..." aria-label={`Search ${label}`} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          <div className="ym-head">
            <button type="button" className="ym-clear" onClick={() => onChange([])} disabled={!value.length}>Clear ({value.length})</button>
            <button type="button" className="btn btn-primary ym-done" onClick={() => setOpen(false)}>Done</button>
          </div>
          <div className="ym-list">
            {shown.map((o) => (
              <label key={o.value} className="ym-row">
                <input type="checkbox" checked={sel.has(o.value)} onChange={() => toggle(o.value)} />{o.label}
              </label>
            ))}
            {!shown.length && <div className="ms-empty">No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Checklist of years with their months; value is ['2026', '2025-03', ...], [] = all time. */
function YearMonth({ id, label, value = [], years, onChange, active }) {
  const [open, setOpen, ref] = usePopover();
  const [expanded, setExpanded] = useState(() => new Set(value.length ? value.map((s) => s.slice(0, 4)) : years.slice(0, 1).map(String)));

  const sel = new Set(value);
  const toggleYear = (y) => {
    const ys = String(y);
    const next = value.filter((s) => s.slice(0, 4) !== ys); // a year pick replaces its single months
    onChange(sel.has(ys) ? next : [...next, ys]);
  };
  const toggleMonth = (y, m) => {
    const ys = String(y), k = `${ys}-${String(m + 1).padStart(2, '0')}`;
    if (sel.has(ys)) { onChange([...value.filter((s) => s !== ys), k]); return; } // narrow the whole year to this month
    onChange(sel.has(k) ? value.filter((s) => s !== k) : [...value, k]);
  };
  const toggleExpand = (y) => setExpanded((p) => { const n = new Set(p); n.has(y) ? n.delete(y) : n.add(y); return n; });

  const summary = !value.length ? 'All'
    : value.length === 1 ? (value[0].length === 4 ? value[0] : `${MONTHS[+value[0].slice(5) - 1].slice(0, 3)} ${value[0].slice(0, 4)}`)
      : `${value.length} selected`;

  return (
    <div className={`field ym ${active ? 'active' : ''}`} ref={ref}>
      <label htmlFor={id}>{label}</label>
      <button type="button" id={id} className="ym-trigger" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{summary}</button>
      {open && (
        <div className="ym-pop" role="group" aria-label={label}>
          <div className="ym-head">
            <button type="button" className="ym-clear" onClick={() => onChange([])} disabled={!value.length}>Clear ({value.length})</button>
            <button type="button" className="btn btn-primary ym-done" onClick={() => setOpen(false)}>Done</button>
          </div>
          <div className="ym-list">
            {years.map((y) => {
              const ys = String(y);
              const isOpen = expanded.has(ys);
              return (
                <div key={y}>
                  <div className="ym-row ym-year">
                    <button type="button" className="ym-caret" aria-label={`${isOpen ? 'Hide' : 'Show'} months of ${y}`} aria-expanded={isOpen} onClick={() => toggleExpand(ys)}>{isOpen ? '▾' : '▸'}</button>
                    <label><input type="checkbox" checked={sel.has(ys)} onChange={() => toggleYear(y)} />{y}</label>
                  </div>
                  {isOpen && MONTHS.map((mn, m) => {
                    const k = `${ys}-${String(m + 1).padStart(2, '0')}`;
                    return (
                      <label key={k} className="ym-row ym-month">
                        <input type="checkbox" checked={sel.has(k)} onChange={() => toggleMonth(y, m)} />{mn}
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * filters: [{ id, label, type: 'select' | 'period' | 'yearmonth', options?: (string | {value,label})[] , allLabel? }]
 * values: { [id]: value } - a 'select' filter holds a list of picked values ([] = All);
 * period custom range stored as `${id}From` / `${id}To` (day numbers)
 * picks: [{ id, label, fmt? }] - selections made by clicking charts that have no dropdown of their own;
 * shown as removable chips under the filters.
 */
export default function FilterBar({ filters, values, set, reset, asOf, defaults = {}, picks = [] }) {
  const dirty = [...filters, ...picks].some((f) => !same(values[f.id], defaults[f.id]));
  const chips = picks.flatMap((p) => (values[p.id] || []).map((v) => ({ ...p, v })));
  return (
    <div className="filters" role="group" aria-label="Filters">
      {filters.map((f) => {
        const id = `flt-${f.id}`;
        const val = values[f.id] ?? '';
        const active = val !== '' && !same(val, defaults[f.id]);
        if (f.type === 'yearmonth') {
          return <YearMonth key={f.id} id={id} label={f.label} value={values[f.id] || []} years={f.years} active={active} onChange={(v) => set(f.id, v)} />;
        }
        if (f.type === 'period') {
          const opts = periodOptions(asOf);
          return (
            <div key={f.id} className={`field ${val === 'custom' ? 'dates' : ''} ${active ? 'active' : ''}`}>
              <label htmlFor={id}>{f.label}</label>
              <select id={id} value={val} onChange={(e) => set(f.id, e.target.value)}>
                {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {val === 'custom' && (
                <div className="dates-row">
                  <input type="date" aria-label={`${f.label} from`} value={isoDate(values[`${f.id}From`])}
                    onChange={(e) => set(`${f.id}From`, dayFromISO(e.target.value))} />
                  <span className="muted">to</span>
                  <input type="date" aria-label={`${f.label} to`} value={isoDate(values[`${f.id}To`])}
                    onChange={(e) => set(`${f.id}To`, dayFromISO(e.target.value))} />
                </div>
              )}
            </div>
          );
        }
        const opts = (f.options || []).map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
        return <MultiSelect key={f.id} id={id} label={f.label} value={values[f.id] || []} options={opts} allLabel={f.allLabel} active={active} onChange={(v) => set(f.id, v)} />;
      })}
      <button type="button" className="btn" onClick={reset} disabled={!dirty}>Reset all filters</button>
      {chips.length > 0 && (
        <div className="picks" aria-label="Chart selections">
          <span className="picks-label">Selected on charts</span>
          {chips.map((c) => (
            <button type="button" key={`${c.id}:${c.v}`} className="pick-chip" title="Remove this selection"
              onClick={() => set(c.id, values[c.id].filter((x) => x !== c.v))}>
              <span className="muted">{c.label}:</span> {c.fmt ? c.fmt(c.v) : c.v} <span aria-hidden="true">✕</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
