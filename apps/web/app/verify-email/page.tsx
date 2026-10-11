'use client';

import Link from 'next/link';
import { useState } from 'react';
import { API_URL } from '../api';
import { button, card, errorText, useTokenFromUrl } from '../auth-ui';

export default function VerifyEmailPage() {
  const token = useTokenFromUrl();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  // Confirmation needs a click. Email security scanners and link previews
  // open every link in a message; if merely opening the page used the
  // token up, the scanner would spend it before the user ever saw it.
  async function confirm() {
    setState('busy');
    try {
      const res = await fetch(`${API_URL}/auth/verify-email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (res.ok) return setState('done');
      const data = await res.json().catch(() => ({}));
      setError(data.message ?? 'This link didn’t work. Please request a new one.');
      setState('error');
    } catch {
      setError('Could not reach the server. Please try again.');
      setState('error');
    }
  }

  if (token === undefined) return null;

  return (
    <div style={card}>
      <h1 style={{ margin: 0 }}>Confirm your email</h1>
      {token === null && <p style={errorText}>This link is missing its code. Please use the link from your email.</p>}

      {token && state !== 'done' && (
        <>
          <p style={{ margin: 0 }}>Click below to confirm this is your email address.</p>
          <button type="button" style={button} onClick={confirm} disabled={state === 'busy'}>
            {state === 'busy' ? 'Confirming…' : 'Confirm my email'}
          </button>
        </>
      )}
      {state === 'error' && <p role="alert" style={errorText}>{error}</p>}
      {state === 'done' && (
        <p role="status" style={{ margin: 0 }}>
          ✓ Your email is confirmed. You can now post feedback. <Link href="/">Go to the feed</Link>
        </p>
      )}
    </div>
  );
}
