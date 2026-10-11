'use client';

import Link from 'next/link';
import { useState } from 'react';
import { API_URL } from '../api';
import { AuthCard, FormError, useTokenFromUrl } from '../auth-ui';
import { Button } from '@/components/ui/button';

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
    <AuthCard title="Confirm your email">
      {token === null && <FormError>This link is missing its code. Please use the link from your email.</FormError>}

      {token && state !== 'done' && (
        <>
          <p className="text-sm">Click below to confirm this is your email address.</p>
          <Button className="w-full" onClick={confirm} disabled={state === 'busy'}>
            {state === 'busy' ? 'Confirming…' : 'Confirm my email'}
          </Button>
        </>
      )}
      {state === 'error' && <FormError>{error}</FormError>}
      {state === 'done' && (
        <p role="status" className="text-sm">
          <span className="font-semibold text-success">✓ Your email is confirmed.</span> You can now post reviews.{' '}
          <Link href="/" className="text-primary hover:underline">Go to the feed</Link>
        </p>
      )}
    </AuthCard>
  );
}
