'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { API_URL } from '../api';
import { button, card, errorText, Field } from '../auth-ui';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include', // lets the browser store the session cookie the API sets
        body: JSON.stringify({ identifier, password }),
      });
      if (res.ok) {
        router.push('/');
        router.refresh();
        return;
      }
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        const minutes = Math.max(1, Math.ceil((data.retryAfterSeconds ?? 900) / 60));
        setError(`Too many failed attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
        return;
      }
      // One message for "no such user" and "wrong password", on purpose.
      setError(res.status === 401 ? 'Invalid username/email or password.' : 'Something went wrong. Please try again.');
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={card} noValidate>
      <h1 style={{ margin: 0 }}>Log in</h1>

      <Field
        label="Username or email"
        name="identifier"
        autoComplete="username"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      {error && <p role="alert" style={errorText}>{error}</p>}

      <button type="submit" style={button} disabled={busy || !identifier || !password}>
        {busy ? 'Logging in…' : 'Log in'}
      </button>
      <p style={{ margin: 0 }}>
        <Link href="/forgot-password">Forgot your password?</Link>
      </p>
      <p style={{ margin: 0 }}>
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </form>
  );
}
