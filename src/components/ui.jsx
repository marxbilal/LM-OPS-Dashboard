import { useState } from 'react';
import DataTable from './DataTable.jsx';

const PATHS = {
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 5.2a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6ZM13.3 17h-2.6v-5.8h2.6V17Z',
  warn: 'M12 2.5 1.5 21h21L12 2.5Zm1.3 15.2h-2.6v-2.5h2.6v2.5Zm0-4.3h-2.6V8.6h2.6v4.8Z',
  alert: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1.3 15h-2.6v-2.6h2.6V17Zm0-4.2h-2.6V7h2.6v5.8Z',
  check: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.6 14.6-4.3-4.3 1.8-1.8 2.5 2.5 5.5-5.5 1.8 1.8-7.3 7.3Z',
  lock: 'M17 9V7A5 5 0 0 0 7 7v2a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2ZM9 7a3 3 0 0 1 6 0v2H9V7Zm4 9.7V18h-2v-1.3a2 2 0 1 1 2 0Z',
  search: 'M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.25 4.24-1.42 1.42-4.24-4.25A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z',
  close: 'm6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 10.6 3.6 2.1-1 1.7L11 13.7V7h2v5.6Z',
};
export function Icon({ name, className, title }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} fill="currentColor">
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}

const STATUS_ICON = { good: 'check', warn: 'warn', serious: 'alert', critical: 'alert', neutral: 'info', brand: 'info' };
export function Chip({ tone = 'neutral', children, icon = true }) {
  return <span className={`chip ${tone}`}>{icon && <Icon name={STATUS_ICON[tone]} />}{children}</span>;
}

export function Kpi({ label, value, unit, sub, tone, chip, onClick, title, active }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`kpi ${tone || ''} ${active ? 'active' : ''}`} onClick={onClick} type={onClick ? 'button' : undefined}
      aria-pressed={onClick && active != null ? active : undefined}
      title={title ?? (onClick ? (active ? 'Click to show everything again' : 'Click to filter the page to these') : undefined)}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}{unit && <small>{unit}</small>}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
      {chip}
    </Tag>
  );
}

const BANNER_ICON = { info: 'info', warn: 'warn', critical: 'alert', good: 'check', accent: 'info' };
export function Banner({ tone = 'info', title, children, action, onClick }) {
  return (
    <div className={`banner ${tone} ${onClick ? 'clickable' : ''}`} onClick={onClick} role={onClick ? 'button' : 'status'}
      tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}>
      <Icon name={BANNER_ICON[tone] || 'info'} className="b-icon" />
      <div><b>{title}</b>{children && <p>{children}</p>}</div>
      {action}
    </div>
  );
}

export function Legend({ items }) {
  if (!items || items.length < 2) return null;
  return (
    <div className="legend" aria-label="Legend">
      {items.map((it) => <span key={it.name}><i className={it.kind === 'line' ? 'line' : ''} style={{ background: it.color }} />{it.name}</span>)}
    </div>
  );
}

export function ChartCard({ title, sub, legend, table, children, tools, foot, className = '', id }) {
  const [view, setView] = useState('chart');
  return (
    <section className={`card ${className}`} id={id} aria-label={title}>
      <header className="card-head">
        <div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>
        <div className="head-tools">
          {tools}
          {table && (
            <div className="seg" role="group" aria-label={`${title} view`}>
              <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')}>Chart</button>
              <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button>
            </div>
          )}
        </div>
      </header>
      <div className="card-body">
        {view === 'chart' || !table ? <><Legend items={legend} />{children}</> : <DataTable {...table} maxHeight={420} />}
      </div>
      {foot && <div className="card-foot">{foot}</div>}
    </section>
  );
}

export function Card({ title, sub, tools, children, className = '' }) {
  return (
    <section className={`card ${className}`} aria-label={title}>
      {(title || tools) && (
        <header className="card-head">
          <div>{title && <h3>{title}</h3>}{sub && <p>{sub}</p>}</div>
          {tools && <div className="head-tools">{tools}</div>}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
