// NetSuite Data Sync proxy. The browser asks for one page of one table at a time; this function signs
// the request with Token-Based Authentication (OAuth 1.0a, HMAC-SHA256) and runs that table's SuiteQL
// query (src/data/netsuite.js) on NetSuite's REST API. Nothing is deployed inside NetSuite.
// Secrets live only in Netlify environment variables (or .env locally) - never in the browser bundle.
//
// GET /api/netsuite-sync?table=cards&page=0  -> { table, rows: [{...}], page, pageCount, total }
import crypto from 'node:crypto';
import { TABLES } from '../../src/data/netsuite.js';

const KEYS = ['ACCOUNT_ID', 'CONSUMER_KEY', 'CONSUMER_SECRET', 'TOKEN_ID', 'TOKEN_SECRET'];
// Each setting may be named NETSUITE_<KEY> (the names used in .env) or NS_<KEY>.
const settings = (env = process.env) => Object.fromEntries(KEYS.map((k) => [`NS_${k}`, env[`NETSUITE_${k}`] || env[`NS_${k}`]]));
const uploadKey = () => process.env.UPLOAD_KEY || '17278';
const enc = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

/** RFC 5849 signature base string + HMAC (NetSuite TBA uses HMAC-SHA256). */
export function sign(method, baseUrl, allParams, consumerSecret, tokenSecret, algo = 'sha256') {
  const pairs = Object.entries(allParams).map(([k, v]) => [enc(k), enc(v)]);
  pairs.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  const base = [method.toUpperCase(), enc(baseUrl), enc(pairs.map(([k, v]) => `${k}=${v}`).join('&'))].join('&');
  const key = `${enc(consumerSecret)}&${enc(tokenSecret)}`;
  return crypto.createHmac(algo, key).update(base).digest('base64');
}

export function oauthHeader(method, baseUrl, params, env = settings(), now = Date.now(), nonce = crypto.randomBytes(16).toString('hex')) {
  const oauth = {
    oauth_consumer_key: env.NS_CONSUMER_KEY,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: String(Math.floor(now / 1000)),
    oauth_token: env.NS_TOKEN_ID,
    oauth_version: '1.0',
  };
  const signature = sign(method, baseUrl, { ...params, ...oauth }, env.NS_CONSUMER_SECRET, env.NS_TOKEN_SECRET);
  const realm = String(env.NS_ACCOUNT_ID).toUpperCase().replace(/-/g, '_');
  const fields = { ...oauth, oauth_signature: signature };
  return `OAuth realm="${realm}", ${Object.entries(fields).map(([k, v]) => `${k}="${enc(v)}"`).join(', ')}`;
}

export default async (req) => {
  if (req.headers.get('x-upload-key') !== uploadKey()) return json({ error: 'Wrong upload key' }, 403);
  const env = settings();
  const missing = KEYS.filter((k) => !env[`NS_${k}`]);
  if (missing.length) return json({ error: `NetSuite sync is not configured on this site yet (missing ${missing.map((k) => `NETSUITE_${k}`).join(', ')}). Upload the export file instead.` }, 501);

  const url = new URL(req.url);
  const name = url.searchParams.get('table') || 'cards';
  const table = TABLES[name];
  if (!table) return json({ error: `Unknown table "${name}".` }, 400);
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10) || 0);

  const baseUrl = `https://${env.NS_ACCOUNT_ID.toLowerCase().replace(/_/g, '-')}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`;
  const params = { limit: String(table.pageSize), offset: String(page * table.pageSize) };
  const query = Object.entries(params).map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');

  let r;
  try {
    r = await fetch(`${baseUrl}?${query}`, {
      method: 'POST',
      headers: {
        Authorization: oauthHeader('POST', baseUrl, params, env),
        'Content-Type': 'application/json', Accept: 'application/json', Prefer: 'transient',
      },
      body: JSON.stringify({ q: table.sql }),
    });
  } catch (e) {
    return json({ error: `Could not reach NetSuite: ${e.message}` }, 502);
  }
  const text = await r.text();
  if (!r.ok) {
    let detail = text.slice(0, 400);
    try { detail = JSON.parse(text)['o:errorDetails']?.[0]?.detail || detail; } catch { /* keep raw text */ }
    return json({ error: `NetSuite responded ${r.status}: ${detail}` }, r.status === 429 ? 429 : 502);
  }
  let data;
  try { data = JSON.parse(text); } catch { return json({ error: 'NetSuite returned something that is not JSON.' }, 502); }
  const rows = (data.items || []).map(({ links, ...row }) => row);
  const total = data.totalResults ?? rows.length;
  return json({ table: name, rows, page, pageCount: Math.max(1, Math.ceil(total / table.pageSize)), total });
};

export const config = { path: '/api/netsuite-sync' };
