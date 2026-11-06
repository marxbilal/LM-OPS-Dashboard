// NetSuite Data Sync over SuiteQL - nothing is deployed inside NetSuite.
// One joined query over the vehicle cards is far too slow (~25 s per 1,000 rows, mostly the PO and
// name joins), so each record type is pulled as its own lean table and joined here by internal ID.
// Used by netlify/functions/netsuite-sync.mjs (the SQL) and the browser (mergeTables).
// NetSuite lower-cases column aliases and leaves out null values, so aliases are lower-case on purpose.

export const TABLES = {
  // [CSM] Vehicle Card - one row per card, the backbone of the export
  cards: {
    pageSize: 1000,
    sql: `SELECT
  vc.id,
  vc.custrecord_cts_csm_vc_chassis AS chassis,
  BUILTIN.DF(vc.cseg_cts_csm_brand) AS brand,
  BUILTIN.DF(vc.custrecord_cts_csm_vc_model) AS model,
  BUILTIN.DF(vc.custrecord_cts_csm_vc_trim) AS trim,
  BUILTIN.DF(vc.custrecord_cts_csm_vc_transmission) AS transmission,
  BUILTIN.DF(vc.custrecord_cts_csm_vc_fuel_type) AS fuel,
  vc.custrecord_cts_csm_vc_engine_capacity AS engine,
  BUILTIN.DF(vc.custrecord_cts_csm_vc_ext_color) AS extcolor,
  BUILTIN.DF(vc.custrecord_cts_csm_vc_int_color) AS intcolor,
  vc.custrecord_cts_csm_vc_model_year AS modelyear,
  BUILTIN.DF(vc.custrecord_cts_csm_vc_model_code) AS modelcode,
  vc.custrecord_cts_vc_list_price AS listprice,
  BUILTIN.DF(vc.custrecord_cts_csm_vc_shipment_status) AS shipstatus,
  BUILTIN.DF(vc.custrecord_cts_csm_vc_vehicle_status) AS vehstatus,
  vc.custrecord_cts_csm_vc_purchase_date AS purchasedate,
  BUILTIN.DF(vc.custrecord_cts_csm_vc_subsidiary) AS subsidiary,
  BUILTIN.DF(vc.custrecord_cts_csm_vc_location) AS location,
  vc.custrecord_cts_csm_vc_purchase_price AS pp,
  BUILTIN.DF(vc.custrecord_cts_csm_vc_purchase_currency) AS pccy,
  vc.custrecord_cts_csm_vc_landed_cost AS lc,
  vc.custrecord_cts_csm_vc_total_cost AS tc,
  vc.custrecord_cts_csm_vc_out_price AS outprice,
  BUILTIN.DF(vc.custrecord_cts_csm_vc_out_currency) AS outccy,
  vc.custrecord_cts_csm_vc_out_date AS outdate,
  vc.custrecord_cts_csm_vc_customer AS customer,
  BUILTIN.DF(vc.custrecord_cts_csm_vc_vst) AS vst,
  vc.custrecord_cts_csm_vc_vst AS vstid,
  vc.custrecord_cts_csm_vc_vobs AS void,
  vc.custrecord_cts_csm_vc_vibs AS ibvid,
  vc.custrecord_cts_csm_vc_vibs_line AS ibviid,
  vc.custrecord_cts_csm_vc_vpo AS poid
FROM customrecord_cts_csm_vc vc
ORDER BY vc.id`,
  },
  // [CSM] Vehicle Sales Transaction
  vst: {
    pageSize: 1000,
    sql: `SELECT vst.id, vst.custrecord_cts_csm_vst_date AS created, vst.custrecord_cts_csm_vst_memo AS memo,
  vst.custrecord_cts_csm_vst_destination_port AS port, vst.custrecord_cts_csm_vst_sales_rep AS rep
FROM customrecord_cts_csm_vst vst
ORDER BY vst.id`,
  },
  // [CSM] Vehicle Outbound
  vo: {
    pageSize: 1000,
    sql: `SELECT vo.id, vo.custrecord_cts_vo_destination_port AS port FROM customrecord_cts_vo vo ORDER BY vo.id`,
  },
  // [CSM] Vehicle Inbound (IBV) with its native Inbound Shipment
  ibv: {
    pageSize: 1000,
    sql: `SELECT
  ibv.id, ibv.name, ibv.custrecord_cts_ibv_date AS ibvdate, BUILTIN.DF(ibv.custrecord_cts_ibv_status) AS status,
  ibv.custrecord_cts_ibv_received_date AS received, ibv.custrecord_cts_ibv_memo AS memo,
  BUILTIN.DF(ibv.custrecord_cts_ibv_subsidiary) AS subsidiary,
  ibs.shipmentnumber AS shipno, ibs.shipmentstatus AS shipstatus, ibs.billoflading AS bl, ibs.vesselnumber AS vessel,
  ibs.custrecord12 AS pol, ibs.custrecord13 AS pod, ibs.custrecord4 AS containers, ibs.custrecord5 AS units,
  ibs.shipmentcreateddate AS shipcreated, ibs.expectedshippingdate AS etd, ibs.actualshippingdate AS atd,
  ibs.expecteddeliverydate AS eta, ibs.actualdeliverydate AS ata, ibs.shipmentmemo AS shipmemo
FROM customrecord_cts_ivr ibv
LEFT JOIN inboundshipment ibs ON ibs.id = ibv.custrecord_cts_ibv_ibs
ORDER BY ibv.id`,
  },
  // IBV Items (quantity per IBV line)
  ibvi: {
    pageSize: 1000,
    sql: `SELECT ibvi.id, ibvi.custrecord_cts_ibvi_recvd_qty AS qty FROM customrecord_cts_ibvi ibvi ORDER BY ibvi.id`,
  },
  // Purchase orders. PO Location is left out: it lives on the transaction line and that join alone
  // takes ~14 s per page.
  po: {
    pageSize: 500,
    sql: `SELECT
  po.id, po.tranid, po.trandate, po.entity AS vendor, BUILTIN.DF(po.currency) AS ccy, po.exchangerate AS fx,
  po.duedate AS receiveby, po.memo, po.custbody_alf_subsidiary_name AS subsidiary,
  BUILTIN.DF(po.custbody_cts_trx_branch) AS branch,
  BUILTIN.DF(po.custbody_cts_trx_vendor_adv_reqd) AS advreqd, po.custbody_cts_trx_vendor_adv_amt AS advamt,
  po.custbody_cts_po_notes AS notes, po.custbody_mgx_po_advance_amount AS advpaid,
  po.custbody_mgx_po_advance_remaining AS advremaining, po.custbody_po_advance_date AS advdate,
  BUILTIN.DF(po.custbody_cts_trx_approval_status) AS approval, po.custbody_cts_approved_by AS approvedby,
  po.custbody_cts_approved_date AS approveddate, po.custbody_released_by AS releasedby, ABS(po.foreigntotal) AS total
FROM transaction po
WHERE po.type = 'PurchOrd'
ORDER BY po.id`,
  },
  // IBV landed-cost lines: what each IBV's landed cost is made of (ocean freight, clearing, customs duty...), in AED
  ibvlc: {
    pageSize: 1000,
    sql: `SELECT l.id, BUILTIN.DF(l.custrecord_cts_ibvlc_header) AS ibv, BUILTIN.DF(l.custrecord_cts_ibvlc_lc) AS cat,
  l.custrecord_cts_ivblc_amtount_base AS aed
FROM customrecord_cts_ibvlc l
WHERE l.isinactive = 'F'
ORDER BY l.id`,
  },
  // Vendor bills raised against POs (linked on the bill's main line): what has been billed and paid per PO, from day one.
  // Amounts are in the PO's currency. Pages of 500: a 1,000-row page takes ~11 s.
  bills: {
    pageSize: 500,
    sql: `SELECT b.id, tl.createdfrom AS po, ABS(b.foreigntotal) AS total, b.foreignamountpaid AS paid, b.foreignamountunpaid AS unpaid,
  BUILTIN.DF(b.status) AS status
FROM transaction b
JOIN transactionline tl ON tl.transaction = b.id AND tl.mainline = 'T'
WHERE b.type = 'VendBill' AND tl.createdfrom IS NOT NULL
ORDER BY b.id`,
  },
  // Names for customers, vendors and employees (sales reps, approvers): "<code> <name>" like the export
  entity: {
    pageSize: 1000,
    sql: `SELECT e.id, e.entityid AS code, e.altname AS name FROM entity e ORDER BY e.id`,
  },
};

// Same labels as the saved-search export, so the pipeline maps them exactly as it does a file upload.
const HEADER = [
  'Date Created', 'Customer', 'Vehicle Sales Order', 'VST Memo', 'Internal ID', 'Chassis Number', 'Brand', 'Model', 'Trim',
  'Transmission', 'Fuel Type', 'Engine Capacity', 'Exterior Color', 'Interior Color', 'Model Year', 'Model Code', 'List Price',
  'Shipment Status', 'Vehicle Status', 'Purchase Date', 'Subsidiary', 'Location', 'Purchase Price', 'Purchase Currency',
  'Landed Cost', 'Total Cost', 'Out Price', 'Out Currency', 'Out Date', 'Sales Rep', 'Destination Port: VST',
  'Destination Port: Outbound', 'IBV Qty', 'IBV ID', 'IBV Date', 'IBV Status', 'Receiving Date', 'IBV Memo', 'IBV Subsidiary',
  'Shipment No', 'Shipment Status2', 'Bill of Lading', 'Vessel Voyage', 'Port Of Loading', 'Port Of Discharge', 'Containers',
  'Units On Shipment', 'Shipment Created', 'Expected Shipping Date', 'Actual Shipping Date', 'Expected Arrival Date',
  'Actual Delivery Date', 'Shipment Memo', 'PO #', 'PO Date', 'Vendor', 'Vendor #', 'PO Currency', 'PO Exchange Rate',
  'Receive By', 'PO Memo', 'PO Subsidiary', 'Branch', 'Advance Payment Required', 'Advance Amount',
  'Internal Notes', 'PO Advance Amount', 'PO Advance Remaining', 'PO Advance Date', 'PO Approval Status', 'Approved By',
  'Approved Date', 'Released By', 'PO Total', 'IBV Internal ID', 'PO Internal ID',
];

const byId = (rows) => new Map((rows || []).map((r) => [String(r.id), r]));

/**
 * Joins the pulled tables into the export's shape: { header, rows } with one row per vehicle card,
 * plus extras that the export doesn't carry: landed (IBV landed-cost lines [{ ibv, cat, aed }]) and
 * bills (vendor bills per PO [{ po, total, paid, unpaid, status }]).
 */
export function mergeTables(t) {
  const vst = byId(t.vst), vo = byId(t.vo), ibv = byId(t.ibv), ibvi = byId(t.ibvi), po = byId(t.po), ent = byId(t.entity);
  const named = (id) => { const e = id == null ? null : ent.get(String(id)); return e ? [e.code, e.name].filter(Boolean).join(' ') : null; };
  const seen = new Set();
  const rows = [];
  for (const c of t.cards || []) {
    if (seen.has(c.id)) continue; // a page boundary that shifted mid-sync
    seen.add(c.id);
    const s = vst.get(String(c.vstid)) || {}, o = vo.get(String(c.void)) || {}, i = ibv.get(String(c.ibvid)) || {};
    const il = ibvi.get(String(c.ibviid)) || {}, p = po.get(String(c.poid)) || {};
    const vendor = p.vendor == null ? null : ent.get(String(p.vendor));
    rows.push([
      s.created, named(c.customer), c.vst, s.memo, c.id, c.chassis, c.brand, c.model, c.trim,
      c.transmission, c.fuel, c.engine, c.extcolor, c.intcolor, c.modelyear, c.modelcode, c.listprice,
      c.shipstatus, c.vehstatus, c.purchasedate, c.subsidiary, c.location, c.pp, c.pccy,
      c.lc, c.tc, c.outprice, c.outccy, c.outdate, named(s.rep), s.port,
      o.port, il.qty, i.name, i.ibvdate, i.status, i.received, i.memo, i.subsidiary,
      i.shipno, i.shipstatus, i.bl, i.vessel, i.pol, i.pod, i.containers,
      i.units, i.shipcreated, i.etd, i.atd, i.eta,
      i.ata, i.shipmemo, p.tranid, p.trandate, vendor?.name, vendor?.code, p.ccy, p.fx,
      p.receiveby, p.memo, p.subsidiary, p.branch, p.advreqd, p.advamt,
      p.notes, p.advpaid, p.advremaining, p.advdate, p.approval, named(p.approvedby),
      p.approveddate, named(p.releasedby), p.total, i.id, p.id,
    ].map((v) => (v === undefined ? null : v)));
  }
  const landed = (t.ibvlc || []).map((l) => ({ ibv: l.ibv ?? null, cat: l.cat ?? null, aed: l.aed ?? null }));
  const bills = (t.bills || []).map((b) => ({ po: b.po ?? null, total: b.total ?? null, paid: b.paid ?? null, unpaid: b.unpaid ?? null, status: b.status ?? null }));
  return { header: HEADER, rows, extras: { landed, bills } };
}
