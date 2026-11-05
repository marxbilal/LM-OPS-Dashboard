import { useMemo } from 'react';
import { useData } from '../context.js';
import { int, aed, pct } from '../format.js';
import { yearOf } from '../format.js';

export default function FlowRibbon({ route, go }) {
  const { ds } = useData();
  const f = useMemo(() => {
    const { V, S, P, meta } = ds;
    const asOf = meta.asOf, fy = yearOf(asOf);
    const openPO = P.filter((p) => p.isOpen === 'Y').length;
    const notShipped = P.filter((p) => yearOf(p.date) === fy).reduce((a, p) => a + (p.notCarded || 0), 0);
    const transit = V.filter((v) => v.inTransit);
    const openShips = S.filter((s) => s.status === 'In transit');
    const late = openShips.filter((s) => s.stage !== 'In transit - ETA ahead').length;
    const stock = V.filter((v) => v.inStock);
    const stockVal = stock.reduce((a, v) => a + (v.tc || 0), 0);
    const aged = stock.filter((v) => v.bucket === '90+').length;
    const paid = V.filter((v) => v.openVso && v.comm === 'Paid - awaiting delivery').length;
    const reserved = V.filter((v) => v.openVso && v.comm === 'Reserved (not fully paid)').length;
    const mStart = asOf - (new Date(asOf * 86400000).getUTCDate() - 1);
    const disp = V.filter((v) => v.dispatched && v.out != null && v.out >= mStart && v.out <= asOf).length;
    return { openPO, notShipped, transit: transit.length, openShips: openShips.length, late, stock: stock.length, stockVal, aged, paid, reserved, disp };
  }, [ds]);

  const nodes = [
    { id: 'po', step: 'Ordered', val: int(f.openPO), unit: 'open POs', sub: `${aed(f.notShipped)} not yet shipped (est.)` },
    { id: 'inbound', step: 'On the way', val: int(f.transit), unit: 'cars', sub: `${int(f.openShips)} shipments · ${int(f.late)} past or without ETA` },
    { id: 'inventory', step: 'In stock', val: int(f.stock), unit: 'cars', sub: `${aed(f.stockVal)} · ${pct(f.stock ? f.aged / f.stock : 0, 0)} over 90 days` },
    { id: 'outbound', step: 'Paid, awaiting delivery', val: int(f.paid), unit: 'cars', sub: `+ ${int(f.reserved)} reserved, not fully paid`, key: 'outbound-paid' },
    { id: 'outbound', step: 'Dispatched', val: int(f.disp), unit: 'this month', sub: 'Sold and moved out', key: 'outbound-disp' },
  ];
  return (
    <nav className="flow" aria-label="Vehicle flow">
      {nodes.map((n) => (
        <button key={n.key || n.id} type="button" className="flow-node" aria-current={route === n.id && n.key !== 'outbound-disp' ? 'true' : undefined} onClick={() => go(n.id)}>
          <span className="flow-step">{n.step}</span>
          <span className="flow-val num">{n.val}<small>{n.unit}</small></span>
          <span className="flow-sub" title={n.sub}>{n.sub}</span>
        </button>
      ))}
    </nav>
  );
}
