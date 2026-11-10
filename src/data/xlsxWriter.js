// Minimal .xlsx writer for the offline copy of a NetSuite pull: plain worksheets (inline strings, numbers as numbers),
// every part deflated with the platform's CompressionStream. SheetJS 0.18 cannot write a 60,000 x 77 sheet compactly
// (its uncompressed output overflows; its deflate leaves ~30 MB), this writes the same workbook in ~13 MB.
const enc = new TextEncoder();

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (crc, bytes) => {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
};

// XML-safe text: escape markup and drop control characters XML does not allow
const BAD_XML = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]', 'g');
const esc = (s) => s.replace(BAD_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// NetSuite sends numbers as text; write plain numbers as numbers (not ids with leading zeros or very long digit runs)
const NUM = /^-?(0|[1-9]\d{0,14})(\.\d+)?$/;
const colName = (i) => { let s = ''; for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

function cell(v, ref) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : '';
  if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
  const s = String(v);
  if (NUM.test(s)) return `<c r="${ref}"><v>${s}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(s)}</t></is></c>`;
}

/** The worksheet XML for [header, ...rows], as text chunks of a few hundred rows. */
function* sheetXml(rows) {
  yield '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  const cols = [];
  let buf = '';
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    let x = `<row r="${r + 1}">`;
    for (let c = 0; c < row.length; c++) { if (!cols[c]) cols[c] = colName(c); x += cell(row[c], cols[c] + (r + 1)); }
    buf += x + '</row>';
    if (r % 400 === 399) { yield buf; buf = ''; }
  }
  yield buf + '</sheetData></worksheet>';
}

/** Deflate text chunks; returns the compressed bytes plus the CRC and size of the uncompressed bytes. */
async function deflate(chunks) {
  let crc = 0, size = 0;
  const it = chunks[Symbol.iterator]();
  const src = new ReadableStream({
    pull(ctl) {
      const n = it.next();
      if (n.done) { ctl.close(); return; }
      const b = enc.encode(n.value);
      crc = crc32(crc, b); size += b.length;
      ctl.enqueue(b);
    },
  });
  const data = new Uint8Array(await new Response(src.pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  return { data, crc, size };
}

const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

/**
 * sheets: [{ name, rows: any[][] }] (first row = header). Returns the .xlsx file bytes.
 * onSheet(name) is called as each sheet starts, for progress messages.
 */
export async function writeXlsx(sheets, onSheet) {
  const ws = (i) => `xl/worksheets/sheet${i + 1}.xml`;
  const xmlHead = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const files = [
    ['[Content_Types].xml', xmlHead + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + sheets.map((_, i) => `<Override PartName="/${ws(i)}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>'],
    ['_rels/.rels', xmlHead + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', xmlHead + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + sheets.map((s, i) => `<sheet name="${esc(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', xmlHead + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + '</Relationships>'],
  ];
  const entries = [];
  for (const [name, xml] of files) entries.push({ name, ...(await deflate([xml])) });
  for (let i = 0; i < sheets.length; i++) {
    onSheet?.(sheets[i].name);
    entries.push({ name: ws(i), ...(await deflate(sheetXml(sheets[i].rows))) });
  }
  // zip: local headers + data, then the central directory
  const dosDate = (1 << 5) | 1; // 1980-01-01; Excel ignores part dates
  const parts = [], central = [];
  let off = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const common = [...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(dosDate), ...u32(e.crc), ...u32(e.data.length), ...u32(e.size), ...u16(name.length), ...u16(0)];
    parts.push(new Uint8Array([...u32(0x04034b50), ...common]), name, e.data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), name);
    off += 30 + name.length + e.data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(cdSize), ...u32(off), ...u16(0)]);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const b of all) { out.set(b, p); p += b.length; }
  return out;
}

/** Rows of objects -> [header, ...rows] using the keys of the first object. */
export const objectsToRows = (objs) => {
  const keys = objs.length ? Object.keys(objs[0]) : [];
  return [keys, ...objs.map((o) => keys.map((k) => o[k]))];
};
