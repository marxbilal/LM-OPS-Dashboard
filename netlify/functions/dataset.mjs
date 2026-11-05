// Shared dataset store for the Supply Chain & Operations dashboard.
// GET  /api/dataset                      -> pointer to the live dataset ({ version, parts, meta }) or { empty: true }
// GET  /api/dataset?version=v&part=i     -> one gzip part of the packed dataset
// PUT  /api/dataset?version=v&part=i     -> upload a part        (needs x-upload-key)
// POST /api/dataset?commit=1             -> make a version live   (needs x-upload-key)
import { getStore } from '@netlify/blobs';

const uploadKey = () => process.env.UPLOAD_KEY || '17278';
const VERSION = /^[a-z0-9-]{4,40}$/;
const PART = /^\d{1,3}$/;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-lm-store': '1' },
});

export async function handle(req, store) {
  const url = new URL(req.url);
  const version = url.searchParams.get('version');
  const part = url.searchParams.get('part');

  if (req.method === 'GET') {
    if (version != null || part != null) {
      if (!VERSION.test(version || '') || !PART.test(part || '')) return json({ error: 'Bad request' }, 400);
      const buf = await store.get(`v/${version}/part-${part}`, { type: 'arrayBuffer' });
      if (!buf) return json({ error: 'Not found' }, 404);
      return new Response(buf, {
        headers: { 'content-type': 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable', 'x-lm-store': '1' },
      });
    }
    const current = await store.get('current', { type: 'json' });
    return json(current || { empty: true });
  }

  if (req.headers.get('x-upload-key') !== uploadKey()) return json({ error: 'Wrong upload key' }, 403);

  if (req.method === 'PUT') {
    if (!VERSION.test(version || '') || !PART.test(part || '')) return json({ error: 'Bad request' }, 400);
    const body = await req.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > 5.5 * 1024 * 1024) return json({ error: 'Part size not accepted' }, 413);
    await store.set(`v/${version}/part-${part}`, body);
    return json({ ok: true });
  }

  if (req.method === 'POST') {
    let b;
    try { b = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
    if (!VERSION.test(b.version || '') || !(b.parts >= 1 && b.parts <= 200)) return json({ error: 'Bad request' }, 400);
    for (let i = 0; i < b.parts; i++) {
      if (!(await store.getMetadata(`v/${b.version}/part-${i}`))) return json({ error: `Part ${i + 1} is missing` }, 400);
    }
    const previous = await store.get('current', { type: 'json' });
    await store.setJSON('current', {
      version: b.version, parts: b.parts, encoding: b.encoding === 'identity' ? 'identity' : 'gzip', bytes: b.bytes,
      meta: b.meta, savedAt: new Date().toISOString(),
    });
    if (previous?.version && previous.version !== b.version) {
      for (let i = 0; i < (previous.parts || 0); i++) {
        try { await store.delete(`v/${previous.version}/part-${i}`); } catch { /* best effort */ }
      }
    }
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}

export default async (req) => handle(req, getStore({ name: 'scm-dataset', consistency: 'strong' }));

export const config = { path: '/api/dataset' };
