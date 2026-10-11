'use client';

import Link from 'next/link';
import { useState } from 'react';
import { API_URL } from '../api';
import { passwordProblems, PASSWORD_RULES } from '../account-rules';
import { button, card, errorText, Field, useTokenFromUrl } from '../auth-ui';

export default function ResetPasswordPage() {
  const token = useTokenFromUrl();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const mismatch = confirmPassword !== '' && confirmPassword !== password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (passwordProblems(password).length) return setError('Your new password doesn’t meet all the rules below.');
    if (password !== confirmPassword) return setError('Passwords don’t match.');

    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      if (res.ok) return setDone(true);
      const data = await res.json().catch(() => ({}));
      setError(data.message ?? data.errors?.password ?? 'Something went wrong. Please try again.');
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (token === undefined) return null;

  if (token === null) {
    return (
      <div style={card}>
        <h1 style={{ margin: 0 }}>Reset password</h1>
        <p style={errorText}>This link is missing its code. <Link href="/forgot-password">Request a new link</Link>.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div style={card}>
        <h1 style={{ margin: 0 }}>Password changed</h1>
        <p role="status" style={{ margin: 0 }}>
          Your password has been updated and you’ve been logged out on all devices. <Link href="/login">Log in</Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={card} noValidate>
      <h1 style={{ margin: 0 }}>Choose a new password</h1>
      <Field label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <ul aria-label="Password requirements" style={{ margin: 0, paddingLeft: 0, listStyle: 'none', fontSize: 14 }}>
        {PASSWORD_RULES.map((rule) => {
          const ok = rule.test(password);
          return (
            <li key={rule.id} style={{ color: ok ? '#1b7f3b' : '#666' }}>
              {ok ? '✓' : '•'} {rule.label}
              <span style={{ position: 'absolute', left: -9999 }}>{ok ? ' (met)' : ' (not met)'}</span>
            </li>
          );
        })}
      </ul>
      <Field
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        error={mismatch ? 'Passwords don’t match.' : undefined}
      />
      {error && (
        <p role="alert" style={errorText}>
          {error} {/expired|already been used|invalid/i.test(error) && <Link href="/forgot-password">Request a new link</Link>}
        </p>
      )}
      <button type="submit" style={button} disabled={busy}>{busy ? 'Saving…' : 'Set new password'}</button>
    </form>
  );
}
