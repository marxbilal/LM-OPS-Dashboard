import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataContext, ROUTES } from './context.js';
import { loadDataset, loadSettings, DEFAULT_SETTINGS } from './data/store.js';
import { unpackDataset } from './data/pack.js';
import { VehicleSearch, VehicleDrawer } from './components/VehicleLookup.jsx';
import { Empty } from './components/ui.jsx';
import { date } from './format.js';
import PurchaseOrders from './pages/PurchaseOrders.jsx';
import Inbound from './pages/Inbound.jsx';
import Inventory from './pages/Inventory.jsx';
import Outbound from './pages/Outbound.jsx';
import Costs from './pages/Costs.jsx';
import Upload from './pages/Upload.jsx';
import SignIn from './components/SignIn.jsx';
import { getSession, signOut } from './data/auth.js';

const PAGES = { po: PurchaseOrders, inbound: Inbound, inventory: Inventory, outbound: Outbound, costs: Costs, upload: Upload };

function useHashRoute() {
  const read = () => {
    const h = (location.hash || '').replace('#', '');
    return PAGES[h] ? h : 'po';
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((id) => {
    if (location.hash !== `#${id}`) location.hash = id;
    else window.scrollTo({ top: 0 });
  }, []);
  return [route, go];
}

/** Nothing of the dashboard (or its data) loads until the user has signed in. */
export default function App() {
  const [session, setSession] = useState(getSession);
  if (!session) return <SignIn onSignedIn={setSession} />;
  return <Dashboard session={session} />;
}

function Dashboard({ session }) {
  const [route, go] = useHashRoute();
  const [state, setState] = useState({ status: 'loading' });
  const [vehicle, setVehicle] = useState(null);
  const [toast, setToast] = useState(null);
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS, shared: false });
  useEffect(() => { loadSettings().then(setSettings).catch(() => {}); }, []);
  const hidden = settings.hiddenPages || [];
  // a hidden page's URL (e.g. #costs) shows Purchase Orders instead
  useEffect(() => { if (hidden.includes(route)) go('po'); }, [route, hidden.join(','), go]);

  useEffect(() => {
    let alive = true;
    loadDataset().then(({ packed, source, shared }) => {
      if (!alive) return;
      if (!packed) { setState({ status: 'empty', shared }); return; }
      try { setState({ status: 'ready', ds: unpackDataset(packed), source, shared }); }
      catch (e) { setState({ status: 'empty', shared, error: e.message }); }
    }).catch((e) => alive && setState({ status: 'empty', error: e.message }));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const ctx = useMemo(() => ({
    ds: state.ds, status: state.status, source: state.source, shared: state.shared,
    apply: (packed, source) => setState((s) => ({ ...s, status: 'ready', ds: unpackDataset(packed), source })),
    toast: setToast, openVehicle: setVehicle, go, settings, setSettings,
  }), [state, go, settings]);

  const Page = PAGES[hidden.includes(route) ? 'po' : route];
  return (
    <DataContext.Provider value={ctx}>
      <header className="nav">
        <div className="nav-inner">
          <a className="nav-brand" href="#po" style={{ color: 'inherit', textDecoration: 'none' }}>
            <b>Legend Motors</b><span>Supply Chain &amp; Operations</span>
          </a>
          <nav className="tabs" aria-label="Pages">
            {ROUTES.filter((r) => !hidden.includes(r.id)).map((r) => <a key={r.id} className="tab" href={`#${r.id}`} aria-current={route === r.id ? 'page' : undefined}>{r.label}</a>)}
          </nav>
          <div className="nav-tools">
            {state.ds && <VehicleSearch onOpen={setVehicle} />}
            <button type="button" className="nav-signout" onClick={signOut} title={`Signed in as ${session.email}`}>Sign out</button>
            <a className="btn-upload" href="#upload" aria-current={route === 'upload' ? 'page' : undefined}>Upload Data</a>
          </div>
        </div>
      </header>
      <main className="page">
        {state.status === 'loading' && <Empty title="Loading the latest data">Fetching the current dataset.</Empty>}
        {state.status !== 'loading' && route !== 'upload' && !state.ds && (
          <Empty title="No data loaded yet"
            action={<a className="btn btn-accent" href="#upload">Go to Upload Data</a>}>
            {state.error ? `${state.error} ` : ''}Load the NetSuite vehicle export on the Upload Data page (key required). Every page fills in as soon as it is accepted.
          </Empty>
        )}
        {(state.ds || route === 'upload') && state.status !== 'loading' && <Page />}
        {state.ds && route !== 'upload' && (
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Source: NetSuite vehicle export ({state.ds.meta.fileName || 'NetSuite'}) · data as of {date(state.ds.meta.asOf)} · {state.source === 'shared' || state.source === 'shared-cache' ? 'shared dataset' : state.source === 'snapshot' ? 'bundled snapshot' : 'saved in this browser'}
          </p>
        )}
      </main>
      {vehicle && <VehicleDrawer vehicle={vehicle} onClose={() => setVehicle(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </DataContext.Provider>
  );
}
