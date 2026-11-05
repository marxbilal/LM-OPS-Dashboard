import { useEffect, useMemo, useState } from 'react';
import { saveFile, toCSV } from './download.js';
import { int } from '../format.js';

const cmp = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
};

export default function DataTable({
  columns, rows, pageSize = 50, search = true, csvName, totals, onRowClick, initialSort, maxHeight = 520, caption, empty = 'No rows match the current filters.',
}) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort || null);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [rows, q, sort]);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => columns.some((c) => {
      const v = c.text ? c.text(r) : r[c.key];
      return v != null && String(v).toLowerCase().includes(needle);
    }));
  }, [rows, q, columns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const c = columns.find((x) => x.key === sort.key);
    if (!c) return filtered;
    const val = c.sort || ((r) => r[c.key]);
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // blanks last in both directions
      if (vb == null) return -1;
      return cmp(va, vb) * sort.dir;
    });
  }, [filtered, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const view = sorted.slice(page * pageSize, page * pageSize + pageSize);
  const toggle = (key) => setSort((s) => (s && s.key === key ? { key, dir: -s.dir } : { key, dir: columns.find((c) => c.key === key)?.align === 'r' ? -1 : 1 }));
  const download = () => saveFile(`${csvName || 'table'}.csv`, toCSV(columns.filter((c) => !c.noCsv), sorted));
  const tot = typeof totals === 'function' ? totals(sorted) : totals;

  return (
    <div>
      {(search || csvName) && (
        <div className="table-bar">
          {search ? (
            <input type="search" placeholder="Search this table" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search this table" />
          ) : <span />}
          <span className="muted num" style={{ fontSize: 12.5 }}>{int(sorted.length)} rows</span>
          {csvName && <button className="btn" type="button" onClick={download}>Download CSV</button>}
        </div>
      )}
      <div className="table-wrap" style={{ maxHeight }}>
        <table className="data">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.align === 'r' ? 'r' : ''} onClick={() => toggle(c.key)} scope="col"
                  aria-sort={sort?.key === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}
                  tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(c.key))}>
                  {c.label}<span className="arrow" aria-hidden="true">{sort?.key === c.key ? (sort.dir > 0 ? '▲' : '▼') : '▼'}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: 24 }} className="muted">{empty}</td></tr>
            )}
            {view.map((r, i) => (
              <tr key={r.__key ?? r.id ?? r.no ?? i} className={onRowClick ? 'clickable' : ''} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {columns.map((c) => {
                  const v = r[c.key];
                  return <td key={c.key} className={`${c.align === 'r' ? 'r' : ''} ${c.wrap ? 'wrap' : ''}`}>{c.fmt ? c.fmt(v, r) : v ?? '-'}</td>;
                })}
              </tr>
            ))}
          </tbody>
          {tot && (
            <tfoot>
              <tr>{columns.map((c, i) => <td key={c.key} className={c.align === 'r' ? 'r' : ''}>{tot[c.key] ?? (i === 0 ? 'Total' : '')}</td>)}</tr>
            </tfoot>
          )}
        </table>
      </div>
      {pages > 1 && (
        <div className="pager">
          <button className="btn" type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="num">{int(page * pageSize + 1)}-{int(Math.min(sorted.length, (page + 1) * pageSize))} of {int(sorted.length)}</span>
          <button className="btn" type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
