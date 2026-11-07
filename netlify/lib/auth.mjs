// Dashboard sign-in, shared by the Netlify functions.
// Users come from DASHBOARD_USERS = "email:salt:hash,email2:salt:hash" (scrypt, hex) - passwords are never stored in
// the code or in plain text. A successful sign-in returns a session token signed with SESSION_SECRET (HMAC-SHA256);
// the data endpoints only answer requests that carry a valid, unexpired token.
import crypto from 'node:crypto';

export const SESSION_DAYS = 7;
const DAY = 86400000;

function users(env) {
  const m = new Map();
  for (const part of String(env.DASHBOARD_USERS || '').split(',')) {
    const [email, salt, hash] = part.trim().split(':');
    if (email && salt && hash) m.set(email.toLowerCase(), { salt, hash });
  }
  return m;
}

/** "salt:hash" for DASHBOARD_USERS (node -e "import('./netlify/lib/auth.mjs').then(a => console.log(a.hashPassword('...')))"). */
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(String(password), salt, 32).toString('hex')}`;
}

export const authConfigured = (env = process.env) => users(env).size > 0 && !!env.SESSION_SECRET;

export function checkPassword(email, password, env = process.env) {
  const u = users(env).get(String(email || '').trim().toLowerCase());
  if (!u) return false;
  const got = crypto.scryptSync(String(password || ''), u.salt, 32);
  const want = Buffer.from(u.hash, 'hex');
  return want.length === got.length && crypto.timingSafeEqual(got, want);
}

const sign = (payload, env) => crypto.createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url');

export function signSession(email, env = process.env, now = Date.now()) {
  const exp = now + SESSION_DAYS * DAY;
  const payload = Buffer.from(JSON.stringify({ email: String(email).trim().toLowerCase(), exp })).toString('base64url');
  return { token: `${payload}.${sign(payload, env)}`, exp };
}

/** The session in the request's "Authorization: Bearer <token>" header, or null when missing, forged or expired. */
export function verifySession(req, env = process.env, now = Date.now()) {
  if (!env.SESSION_SECRET) return null;
  const h = req.headers.get('authorization') || '';
  const [payload, sig] = (h.startsWith('Bearer ') ? h.slice(7) : '').split('.');
  if (!payload || !sig) return null;
  const want = sign(payload, env);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return p && p.exp > now ? p : null;
  } catch { return null; }
}
