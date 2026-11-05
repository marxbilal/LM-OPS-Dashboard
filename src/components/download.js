// Save a generated file. Inside a claude.ai artifact the `downloads` capability is used
// (plain download links are blocked there); everywhere else a normal browser download.
let capPromise = null;
function downloadsCap() {
  if (!capPromise) {
    capPromise = (async () => {
      try {
        if (typeof window === 'undefined' || !window.claude?.use) return null;
        return await window.claude.use('downloads');
      } catch { return null; }
    })();
  }
  return capPromise;
}

// Resolve the capability early (no prompt is shown until a save), so a click saves at once.
if (typeof window !== 'undefined' && window.claude?.use) downloadsCap();

export async function saveFile(filename, text, mime = 'text/csv;charset=utf-8') {
  const cap = await downloadsCap();
  if (cap) {
    // The BOM keeps Arabic and accented names readable when the CSV is opened in Excel.
    try { await cap.save({ filename, data: new Blob(['\uFEFF', text]) }); return true; } catch (e) {
      if (e?.code !== 'declined') console.warn('Download not saved:', e?.code || e);
      return false;
    }
  }
  const blob = new Blob(['\uFEFF', text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

export function toCSV(columns, rows) {
  const q = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => q(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => q(c.csv ? c.csv(r) : c.text ? c.text(r) : r[c.key])).join(',')).join('\n');
  return `${head}\n${body}`;
}
