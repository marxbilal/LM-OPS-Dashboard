import { useEffect, useRef, useState } from 'react';
import { useData } from '../context.js';
import { processUpload, pullNetSuite, processRows, MAX_MB } from '../data/ingest.js';
import { saveDataset } from '../data/store.js';
import { saveFile, toCSV } from '../components/download.js';
import { Banner, Card, Chip, Icon } from '../components/ui.jsx';
import { int, pct, date, dateTime, timeAgo, plural } from '../format.js';

// SHA-256 of the upload key. The page lock is a convenience gate; the shared store and the
// NetSuite sync function check the key again on the server (UPLOAD_KEY on Netlify).
const KEY_HASH = '6489f6aec2b24d9751f53ce51a7ed10a7855963ce576c5b5bd4684991bc61253';
const SESSION = 'lm-scm-upload-key';

async function sha256(text) {
  if (!crypto?.subtle) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const getKey = () => { try { return sessionStorage.getItem(SESSION); } catch { return null; } };
const setKeyStore = (k) => { try { if (k) sessionStorage.setItem(SESSION, k); else sessionStorage.removeItem(SESSION); } catch { /* private mode */ } };

function Lock({ onUnlock }) {
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const h = await sha256(v.trim());
    if (h === KEY_HASH || (h === null && v.trim() === '17278')) { setKeyStore(v.trim()); onUnlock(v.trim()); return; }
    setErr('That key is not right. Try again.');
    setShake(true); setTimeout(() => setShake(false), 400);
  };
  return (
    <form className={`lock ${shake ? 'shake' : ''}`} onSubmit={submit}>
      <Icon name="lock" />
      <h2 style={{ fontSize: 22 }}>Upload Data is locked</h2>
      <p style={{ margin: 0, color: 'var(--ink-2)' }}>Enter the key to load a new export or sync from NetSuite. Dashboards stay open to everyone.</p>
      <label htmlFor="upload-key" className="sr-only">Key</label>
      <input id="upload-key" type="password" inputMode="numeric" autoComplete="off" value={v} onChange={(e) => { setV(e.target.value); setErr(''); }} placeholder="•••••" autoFocus />
      <p className="err" role="alert">{err}</p>
      <button className="btn btn-primary" type="submit" style={{ padding: '10px 14px' }}>Unlock</button>
    </form>
  );
}

function Check({ tone = 'good', title, children }) {
  return <div className={`check ${tone === 'good' ? '' : tone}`}><b>{title}</b>{children && <p>{children}</p>}</div>;
}

export default function Upload() {
  const { ds, source, apply, toast } = useData();
  const [key, setKey] = useState(getKey);
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null);
  const [over, setOver] = useState(false);
  const raw = useRef(null);
  const fileInput = useRef(null);
  useEffect(() => { if (result?.ok) toast?.(`Upload accepted - ${int(result.rows)} rows are live.`); }, [result]);

  if (!key) return <Lock onUnlock={setKey} />;

  const finish = async (out) => {
    if (!out.ok) { setResult({ ok: false, validation: out.validation }); return; }
    setBusy({ stage: 'Publishing', pct: 0.9 });
    const saved = await saveDataset(out.packed, key, (p) => setBusy({ stage: 'Publishing', pct: 0.9 + 0.1 * p }));
    apply(out.packed, saved.mode === 'shared' ? 'shared' : 'local');
    setResult({ ok: true, rows: out.packed.meta.unitsLoaded, mode: saved.mode, warnings: out.packed.validation.warnings });
  };
  const onFile = async (file) => {
    if (!file || busy) return;
    setResult(null); setBusy({ stage: 'Opening the file', pct: 0.02 });
    try { await finish(await processUpload(file, (stage, p) => setBusy({ stage, pct: p }))); }
    catch (e) { setResult({ ok: false, error: e.message }); }
    finally { setBusy(null); }
  };
  const pull = async () => {
    const r = await pullNetSuite(key, (stage, p) => setBusy({ stage, pct: p }));
    raw.current = r;
    return r;
  };
  const sync = async () => {
    if (busy) return;
    setResult(null); setBusy({ stage: 'Connecting to NetSuite', pct: 0.03 });
    try {
      const r = await pull();
      await finish(await processRows(r.header, r.rows, 'NetSuite Data Sync', (stage, p) => setBusy({ stage, pct: p }), r.landed));
    } catch (e) { setResult({ ok: false, error: e.message }); }
    finally { setBusy(null); }
  };
  const downloadRaw = async () => {
    if (busy) return;
    try {
      if (!raw.current) { setBusy({ stage: 'Connecting to NetSuite', pct: 0.03 }); await pull(); }
      const r = raw.current;
      await saveFile(`netsuite-raw-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(r.header.map((h, i) => ({ key: i, label: h })), r.rows));
    } catch (e) { setResult({ ok: false, error: e.message }); }
    finally { setBusy(null); }
  };
  const lock = () => { setKeyStore(null); setKey(null); };

  const v = ds?.validation;
  const m = ds?.meta;
  const where = source === 'shared' || source === 'shared-cache' ? 'Shared - everyone sees this dataset' : source === 'snapshot' ? 'Bundled snapshot (no upload yet)' : 'This browser only';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Upload Data</h1>
          <p>Load the latest NetSuite export. Validation runs before anything replaces the live dashboard.</p>
        </div>
        <button type="button" className="btn" onClick={lock}><Icon name="lock" className="" /> Lock</button>
      </div>

      <div className="upload-grid">
        <Card title="New upload" sub={`Accepted formats: .xlsx, .xlsm, .csv (max ${MAX_MB} MB)`}>
          <div className="upload-options" style={{ padding: '4px 4px 6px' }}>
            <div className="opt">
              <button type="button" className="btn btn-primary" onClick={sync} disabled={!!busy}>NetSuite Data Sync</button>
              <button type="button" className="btn" onClick={downloadRaw} disabled={!!busy} style={{ fontSize: 12 }}>Download raw NetSuite data (CSV)</button>
              <p>Pulls the vehicle saved search straight from NetSuite, one page at a time - the full table takes a minute or two. The download saves exactly what NetSuite returned, before any validation, for checking a sync failure against the source.</p>
            </div>
            <div className={`opt drop ${over ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0]); }}>
              <p style={{ fontSize: 14, color: 'var(--ink)' }}>Drop the Excel file here, or</p>
              <button type="button" className="btn btn-accent" onClick={() => fileInput.current?.click()} disabled={!!busy}>Choose file</button>
              <input ref={fileInput} id="upload-file" type="file" accept=".xlsx,.xlsm,.xls,.csv" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
          </div>
          {busy && (
            <div style={{ padding: '4px 6px 10px', display: 'grid', gap: 6 }} aria-live="polite">
              <div className="progress"><i style={{ width: `${Math.round((busy.pct || 0) * 100)}%` }} /></div>
              <span className="muted" style={{ fontSize: 12.5 }}>{busy.stage}...</span>
            </div>
          )}
        </Card>
        <Card title="Current dataset">
          {m ? (
            <dl className="kv" style={{ padding: '4px 6px 8px' }}>
              <dt>File</dt><dd>{m.fileName || '-'}</dd>
              <dt>Sheet</dt><dd>{m.sheetName || '-'}</dd>
              <dt>Data updated</dt><dd>{dateTime(m.builtAt)} <span className="muted">({timeAgo(m.builtAt)})</span></dd>
              <dt>Units loaded</dt><dd>{int(m.unitsLoaded)} distinct Internal IDs</dd>
              <dt>Rows skipped</dt><dd>{int(m.rowsSkipped)}</dd>
              <dt>Date range</dt><dd>{date(m.dateMin)} to {date(m.dateMax)}</dd>
              <dt>Ageing as of</dt><dd>{date(m.asOf)}</dd>
              <dt>Saved to</dt><dd>{where}</dd>
            </dl>
          ) : <p className="muted" style={{ padding: '4px 6px' }}>No dataset loaded yet.</p>}
        </Card>
      </div>

      {result?.ok && (
        <Banner tone="good" title="Upload accepted">
          {int(result.rows)} rows are now live across all pages{result.mode === 'local' ? ' in this browser. This site has no shared store, so other people need to upload too (see README: deploy with functions).' : '.'}
        </Banner>
      )}
      {result && !result.ok && (
        <Banner tone="critical" title="Upload rejected - the live dashboard was not changed">
          {result.error || result.validation?.errors?.join(' ') || 'The file could not be validated.'}
        </Banner>
      )}
      {v?.warnings?.length > 0 && <Banner tone="warn" title="Loaded with warnings">{v.warnings.join(' ')}</Banner>}

      {v && (
        <div className="grid-2">
          <Card title="Total Cost validation" sub={`Checked ${int(v.totalCost.checked)} records against Purchase Price + Landed Cost`}>
            <div className="check-list" style={{ padding: '4px 6px 8px' }}>
              {v.totalCost.mismatches === 0
                ? <Check title="Every row ties out">Total Cost equals Purchase Cost + Landed Cost on all checked records. All amounts are in AED.</Check>
                : <Check tone="critical" title={`${int(v.totalCost.mismatches)} rows do not tie out`}>Examples (Internal ID): {v.totalCost.examples.join(', ')}</Check>}
              <Check tone={v.columns.missing.length ? 'warn' : 'good'} title={`${v.columns.found} of ${v.columns.expected} expected columns found`}>
                {v.columns.missing.length ? `Missing: ${v.columns.missing.join(', ')}.` : 'Every column the dashboard reads is present.'}
                {v.columns.extra.length ? ` Ignored extra columns: ${v.columns.extra.slice(0, 6).join(', ')}${v.columns.extra.length > 6 ? '...' : ''}.` : ''}
              </Check>
            </div>
          </Card>
          <Card title="Vehicle cards" sub="Internal ID is the card; a car moved between entities or returned gets a new card">
            <div className="check-list" style={{ padding: '4px 6px 8px' }}>
              <Check title={`${int(v.cards.multiChassis)} cars have more than one card`}>
                {int(v.cards.cardsInChains)} cards in total. Only each car's current card counts; {int(v.cards.transferred)} transferred and {int(v.cards.salesReturned)} sales-returned cards are closed.
              </Check>
              <Check tone="warn" title={`${int(v.cards.afterSales)} after-sales cards excluded`}>Service cards are not trading stock, so they stay out of stock and yard counts.</Check>
              <Check tone={v.cards.statusConflicts ? 'warn' : 'good'} title={`${plural(v.cards.statusConflicts, 'status conflict')}`}>
                Shipped but still Available / VSO Reserved / VSO Fulfilled. {v.cards.nonVehicle ? `${int(v.cards.nonVehicle)} non-vehicle items (chargers, forklifts, spare parts) excluded.` : ''}
              </Check>
            </div>
          </Card>
          <Card title="Chassis numbers & locations">
            <div className="check-list" style={{ padding: '4px 6px 8px' }}>
              <Check title={`${int(v.vin.junkCleaned)} chassis numbers cleaned, ${int(v.vin.ioqFixed)} VIN typos fixed`}>
                Quotes, dashes and corrupted characters removed; letters I/O/Q (never valid in a VIN) changed to 1/0. {v.vin.invalid ? `${int(v.vin.invalid)} chassis still not a 17-character VIN.` : ''}
              </Check>
              <Check tone={v.locations.unmapped.length ? 'warn' : 'good'} title={`${int(v.locations.total)} NetSuite locations mapped to location types`}>
                {v.locations.unmapped.length ? `Not mapped yet: ${v.locations.unmapped.map((x) => x.location).join(', ')}.` : 'Every location has a type and site name.'}
              </Check>
              <Check tone={v.locations.pendingReceivingInStock ? 'warn' : 'good'} title={`${int(v.locations.pendingReceivingInStock)} received cars still at Pending Receiving`}>
                IBV complete but the location was not updated at receipt.
              </Check>
            </div>
          </Card>
          <Card title={`Shipment data, ${v.shipments.focusYear}`} sub={`${int(v.shipments.total)} inbound shipments created this year`}>
            <div style={{ padding: '4px 6px 8px' }}>
              {v.shipments.fields.map((x) => {
                const s = x.total ? x.filled / x.total : 0;
                return (
                  <div className="meter-row" key={x.field}>
                    <span>{x.field}</span>
                    <div className="meter"><i style={{ width: `${s * 100}%` }} /></div>
                    <span className="num" style={{ textAlign: 'right' }}>{pct(s, 0)}</span>
                  </div>
                );
              })}
              <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
                {int(v.shipments.copied)} of {int(v.shipments.withAllThree)} shipments with ETD, ATD and ETA have the same date in all three. {int(v.shipments.openNoFutureEta)} of {int(v.shipments.open)} open shipments have no future ETA.
              </p>
            </div>
          </Card>
          <Card title="Sales representative consolidation" sub={`${int(v.reps.merged)} reps appear under more than one employee ID - reported once by name`}>
            <div className="table-wrap" style={{ maxHeight: 300 }}>
              <table className="data">
                <thead><tr><th>Reported as</th><th>Source IDs</th><th className="r">Units</th></tr></thead>
                <tbody>
                  {v.reps.table.filter((r) => r.codes.length > 1).concat(v.reps.table.filter((r) => r.codes.length <= 1)).slice(0, 60).map((r) => (
                    <tr key={r.name}><td>{r.name}</td><td>{r.codes.join(' + ') || '-'}</td><td className="r">{int(r.units)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Destination standardisation" sub="Destination Port: Outbound takes priority over Destination Port: VST">
            <dl className="kv" style={{ padding: '4px 6px 8px', gridTemplateColumns: '210px 1fr' }}>
              <dt>From Destination Port: Outbound</dt><dd>{int(v.destinations.fromOutbound)} units</dd>
              <dt>Fell back to Destination Port: VST</dt><dd>{int(v.destinations.fromVst)} units</dd>
              <dt>Neither populated</dt><dd>{int(v.destinations.neither)} units</dd>
              <dt>Spellings merged</dt><dd>{int(v.destinations.rawSpellings)} spellings into {int(v.destinations.reported)} destinations</dd>
            </dl>
            <div className="table-wrap" style={{ maxHeight: 260 }}>
              <table className="data">
                <thead><tr><th>Reported as</th><th>Source spellings</th><th className="r">Units</th></tr></thead>
                <tbody>
                  {v.destinations.table.slice(0, 40).map((d) => (
                    <tr key={`${d.country}|${d.type}`}>
                      <td>{d.country}<div className="muted" style={{ fontSize: 11.5 }}>{d.type}</div></td>
                      <td className="wrap" style={{ fontSize: 12 }}>{d.spellings.slice(0, 14).join(' · ')}{d.spellings.length > 14 ? ` · +${d.spellings.length - 14} more` : ''}</td>
                      <td className="r">{int(d.units)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Landed cost & ageing" sub={`Imported cars on ${v.landed.focusYear} POs`}>
            <div className="check-list" style={{ padding: '4px 6px 8px' }}>
              <Check tone={v.landed.coverage < 0.9 ? 'warn' : 'good'} title={`Landed cost posted on ${pct(v.landed.coverage, 0)} of received imports`}>
                {int(v.landed.importsNotPosted)} received imported cars have none, including {int(v.landed.inStockImportsNoLanded)} in stock. Costs are shown exactly as posted - nothing is estimated.
              </Check>
              <Check tone={v.ageing.estimated ? 'warn' : 'good'} title="Age counts from the IBV date">
                {v.ageing.estimated ? `${int(v.ageing.estimated)} cars in stock have no IBV, so their age counts from the purchase date.` : 'Every car in stock has an IBV date.'}
              </Check>
            </div>
          </Card>
          <Card title="Cleaning steps applied">
            <ol style={{ margin: 0, padding: '4px 6px 10px 26px', display: 'grid', gap: 6, color: 'var(--ink-2)' }}>
              {(v.log || []).map(([stage, text]) => <li key={stage}><b style={{ color: 'var(--ink)' }}>{stage}.</b> {text}</li>)}
            </ol>
          </Card>
        </div>
      )}
      {!v && !busy && <Chip tone="neutral">Load a file or run the NetSuite sync to see the validation report.</Chip>}
    </>
  );
}
