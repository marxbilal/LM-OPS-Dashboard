// Sign-in screen shown before the dashboard; the check itself runs on the server (/api/login).
import { useState } from 'react';
import { signIn } from '../data/auth.js';

/** Legend Motors wordmark: "Legend" with the purple / orange square mark, "MOTORS" underneath. */
export function LegendLogo() {
  return (
    <div className="legend-logo" aria-label="Legend Motors">
      <div className="legend-logo-row">
        <span className="legend-logo-word">Legend</span>
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
          <path d="M8 2h18v18l-6 6H2V8z" fill="var(--brand)" />
          <path d="M14 2h12v12H14z" fill="var(--accent)" />
          <path d="M14 8h6v6h-6z" fill="#fff" />
        </svg>
      </div>
      <span className="legend-logo-sub">MOTORS</span>
    </div>
  );
}

export default function SignIn({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { onSignedIn(await signIn(email, password)); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="signin">
      <form className="signin-card" onSubmit={submit}>
        <LegendLogo />
        <h1>Supply chain &amp; operations Dashboard</h1>
        <p>Sign in with your Legend email to open the Dashboard.</p>
        <label htmlFor="si-email">Email</label>
        <input id="si-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <label htmlFor="si-password">Password</label>
        <input id="si-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <div className="signin-error" role="alert">{error}</div>}
        <button type="submit" disabled={busy}>{busy ? 'Opening...' : 'Open'}</button>
      </form>
    </div>
  );
}
