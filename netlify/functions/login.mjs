// POST /api/login { email, password } -> { token, email, exp } for the dashboard sign-in page (see netlify/lib/auth.mjs).
import { authConfigured, checkPassword, signSession } from '../lib/auth.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!authConfigured()) return json({ error: 'Sign-in is not set up on this site yet (DASHBOARD_USERS and SESSION_SECRET are missing).' }, 501);
  let b;
  try { b = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  if (!checkPassword(b.email, b.password)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return json({ error: 'Wrong email or password.' }, 401);
  }
  const { token, exp } = signSession(b.email);
  return json({ token, exp, email: String(b.email).trim().toLowerCase() });
};

export const config = { path: '/api/login' };
