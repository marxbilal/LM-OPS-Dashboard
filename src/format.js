import { DAY } from './data/pipeline.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function int(n) {
  if (n == null || isNaN(n)) return '-';
  return Math.round(n).toLocaleString('en-US');
}
export function dec(n, d = 1) {
  if (n == null || isNaN(n)) return '-';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
export function pct(x, d = 1) {
  if (x == null || isNaN(x)) return '-';
  return `${(x * 100).toFixed(d)}%`;
}
/** Compact number: 1,284 / 12.9K / 4.2M / 1.52bn */
export function compact(n) {
  if (n == null || isNaN(n)) return '-';
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}bn`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return int(n);
}
export const aed = (n) => (n == null || isNaN(n) ? '-' : `AED ${compact(n)}`);
export const aedFull = (n) => (n == null || isNaN(n) ? '-' : `AED ${int(n)}`);

export function date(d) {
  if (d == null) return '-';
  const x = new Date(d * DAY);
  return `${String(x.getUTCDate()).padStart(2, '0')} ${MON[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
}
export function isoDate(d) {
  return d == null ? '' : new Date(d * DAY).toISOString().slice(0, 10);
}
export function monthLabel(key) {
  // 'YYYY-MM' -> 'Jan 26'
  const [y, m] = key.split('-');
  return `${MON[+m - 1]} ${y.slice(2)}`;
}
export function monthKey(d) {
  if (d == null) return null;
  const x = new Date(d * DAY);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function monthStart(d) {
  const x = new Date(d * DAY);
  return Math.floor(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1) / DAY);
}
export function monthEnd(d) {
  const x = new Date(d * DAY);
  return Math.floor(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 1) / DAY) - 1;
}
export function addMonths(d, n) {
  const x = new Date(d * DAY);
  return Math.floor(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n, 1) / DAY);
}
/** Monday of the ISO week containing day d */
export function weekStart(d) {
  const dow = (new Date(d * DAY).getUTCDay() + 6) % 7;
  return d - dow;
}
export function yearOf(d) { return d == null ? null : new Date(d * DAY).getUTCFullYear(); }
export function dayFromISO(s) {
  if (!s) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  return isNaN(t) ? null : Math.floor(t / DAY);
}
export function plural(n, one, many = `${one}s`) { return `${int(n)} ${n === 1 ? one : many}`; }
export function timeAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}
export function dateTime(iso) {
  if (!iso) return '-';
  const x = new Date(iso);
  return `${String(x.getDate()).padStart(2, '0')} ${MON[x.getMonth()]} ${x.getFullYear()}, ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
}
