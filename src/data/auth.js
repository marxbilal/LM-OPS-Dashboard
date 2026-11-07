// Dashboard sign-in on the browser side: the session token from /api/login, kept in this browser until it expires
// or the user signs out. Every call to the site's functions sends it (authFetch).
const KEY = 'lm-scm-session';

export function getSession() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s && s.token && s.exp > Date.now() ? s : null;
  } catch { return null; }
}

export function signOut() {
  try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  location.reload();
}

export async function signIn(email, password) {
  let r;
  try {
    r = await fetch('./api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  } catch { throw new Error('Could not reach the sign-in service. Check your connection and try again.'); }
  const j = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  if (!r.ok || !j?.token) throw new Error(j?.error || (r.status === 404 ? 'Sign-in needs the site\'s server functions (Netlify), which this copy of the site does not have.' : `Sign-in failed (${r.status}).`));
  const s = { token: j.token, exp: j.exp, email: j.email };
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* the session then lasts until the page is closed */ }
  return s;
}

/** fetch with the session attached; a 401 (expired or revoked session) signs the user out. */
export async function authFetch(url, opts = {}) {
  const s = getSession();
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), ...(s ? { authorization: `Bearer ${s.token}` } : {}) } });
  if (r.status === 401) signOut();
  return r;
}
