import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../context.js';
import { Icon, Chip } from './ui.jsx';
import { date, int, aedFull, pct } from '../format.js';

const STAGE_TONE = { 'In stock': 'brand', 'In transit': 'warn', Dispatched: 'good' };

export function VehicleSearch({ onOpen }) {
  const { ds } = useData();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const results = useMemo(() => {
    const s = q.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!ds || s.length < 4) return [];
    const out = [];
    for (const v of ds.V) {
      if ((v.ch && v.ch.includes(s)) || String(v.id) === s || (v.vst && v.vst.toUpperCase() === s)) {
        out.push(v);
        if (out.length >= 40) break;
      }
    }
    const rank = (v) => (v.stage.startsWith('Closed') || v.stage.startsWith('Excluded') ? 1 : 0);
    return out.sort((a, b) => rank(a) - rank(b) || b.id - a.id).slice(0, 12);
  }, [q, ds]);
  useEffect(() => {
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, []);
  if (!ds) return null;
  return (
    <div className="vin-search" ref={box}>
      <Icon name="search" />
      <input id="vin-search" type="search" placeholder="Search chassis / VST" value={q} aria-label="Search by chassis number, Internal ID or VST"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { e.preventDefault(); onOpen(results[0]); setOpen(false); } if (e.key === 'Escape') setOpen(false); }} />
      {open && q.trim().length >= 4 && (
        <div className="vin-results" role="listbox">
          {results.length === 0 && <div style={{ padding: 12 }} className="muted">No car matches "{q.trim()}".</div>}
          {results.map((v) => (
            <button key={v.id} type="button" role="option" onClick={() => { onOpen(v); setOpen(false); }}>
              <span className="vr-ch">{v.ch}</span>
              <span className="muted" style={{ fontSize: 12 }}>{v.stage.replace(/ - .*/, '')}</span>
              <span className="vr-sub">{v.brand} {v.model} · {v.entity} · ID {v.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function VehicleDrawer({ vehicle, onClose }) {
  const { ds } = useData();
  const closeRef = useRef(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => closeRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [vehicle]);
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  if (!vehicle) return null;
  const v = vehicle;
  const cards = ds.V.filter((x) => x.ch === v.ch).sort((a, b) => a.id - b.id);
  const ship = v.ship ? ds.S.find((s) => s.no === v.ship) : null;
  const po = v.po ? ds.P.find((p) => p.no === v.po) : null;
  const asOf = ds.meta.asOf;
  const steps = [
    { label: 'Purchase order', d: v.poDate, text: v.po ? `${v.po} · ${v.vendor ?? ''}` : 'No PO on this card (transfer, return or legacy record)' },
    { label: 'Shipment created', d: ship?.created, text: ship ? `${ship.no} · ${ship.mode}${ship.bl ? ` · BL ${ship.bl}` : ''}${ship.eta != null ? ` · ETA ${date(ship.eta)}` : ''}` : 'No inbound shipment' },
    { label: 'IBV - available in NetSuite', d: v.ibvDate, text: v.ibv ? `${v.ibv} · ${v.ibvStatus ?? ''}` : 'No IBV' },
    { label: 'Received in yard', d: v.recv, text: v.recv != null ? `${v.site} (${v.locType})` : v.inTransit ? 'Not received yet' : 'No receiving date recorded' },
    { label: 'Sales order (VST)', d: v.vstDate, text: v.vst ? `${v.vst} · ${v.cust ?? ''}` : 'Not reserved' },
    { label: 'Dispatched', d: v.dispatched ? v.out : null, text: v.dispatched ? `${v.destC !== 'Not set' ? v.destC : 'Destination not set'}` : 'Not dispatched' },
  ];
  const lastDone = steps.reduce((k, s, i) => (s.d != null ? i : k), -1);
  return (
    <>
      <div className="drawer-back" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`Vehicle ${v.ch}`}>
        <div className="drawer-head">
          <div>
            <div className="muted" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>{v.brand} · {v.model}</div>
            <h2>{v.ch}</h2>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <Chip tone={STAGE_TONE[v.stage] || 'neutral'}>{v.stage}</Chip>
              {v.comm !== 'n/a' && <Chip tone="neutral" icon={false}>{v.comm}</Chip>}
              {v.flags.includes('LANDED_COST_MISSING') && <Chip tone="warn">No landed cost</Chip>}
              {v.flags.includes('LOCATION_NOT_UPDATED') && <Chip tone="warn">Location not updated</Chip>}
            </div>
          </div>
          <button ref={closeRef} className="btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" className="" /></button>
        </div>
        <div className="drawer-body">
          <div className="mini-kv">
            <div><small>Entity / location</small><strong>{v.entity} · {v.site}</strong></div>
            <div><small>{v.inStock ? 'Days in stock' : v.inTransit ? 'Days since IBV' : 'Days stock to dispatch'}</small>
              <strong>{v.inStock ? int(v.days) : v.inTransit ? int(v.daysTransit) : v.dStockDisp != null ? int(v.dStockDisp) : '-'}</strong></div>
            <div><small>Purchase cost</small><strong>{aedFull(v.pp)}</strong></div>
            <div><small>Landed cost</small><strong>{v.lc > 0 ? `${aedFull(v.lc)} (${pct(v.lcPct)})${v.lcSrc ? " - from the landed cost sheet" : ""}` : v.lcs}</strong></div>
            <div><small>Total cost</small><strong>{aedFull(v.tc)}</strong></div>
            <div><small>Internal ID</small><strong>{v.id}</strong></div>
          </div>
          <ol className="timeline" aria-label="Vehicle timeline">
            {steps.map((s, i) => (
              <li key={s.label} className={i < lastDone ? 'done' : i === lastDone ? 'now' : ''}>
                <span className="dot" aria-hidden="true" />
                <div><b>{s.label}{s.d != null ? ` · ${date(s.d)}` : ''}</b><span>{s.text}</span></div>
              </li>
            ))}
          </ol>
          {po && (
            <div>
              <h3 style={{ fontSize: 15, marginBottom: 6 }}>Purchase order {po.no}</h3>
              <div className="mini-kv">
                <div><small>PO value</small><strong>{aedFull(po.totalAED)}</strong></div>
                <div><small>Cars on PO</small><strong>{int(po.carded)} ({int(po.received)} received)</strong></div>
                <div><small>Status</small><strong>{po.status}</strong></div>
              </div>
            </div>
          )}
          {cards.length > 1 && (
            <div>
              <h3 style={{ fontSize: 15, marginBottom: 6 }}>All cards for this chassis</h3>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Internal ID</th><th>Entity</th><th>Status</th><th>IBV</th><th>Out date</th></tr></thead>
                  <tbody>
                    {cards.map((c) => (
                      <tr key={c.id}><td>{c.id}</td><td>{c.entity}</td><td>{c.vs}</td><td>{date(c.ibvDate)}</td><td>{date(c.out)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>Data as of {date(asOf)}.</p>
        </div>
      </aside>
    </>
  );
}
