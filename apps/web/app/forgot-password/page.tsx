'use client';

import Link from 'next/link';
import { useState } from 'react';
import { API_URL } from '../api';
import { AuthCard, Field, FormError } from '../auth-ui';
import { Button } from '@/components/ui/button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 202) {
        // Deliberately the same message whether or not the email has an account.
        setMessage(data.message ?? 'If an account uses that email, we’ve sent a link to reset the password.');
      } else if (res.status === 429) {
        setError('Too many requests. Please wait a while before trying again.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Forgot your password?"
      description={message ? undefined : 'Enter the email you signed up with and we’ll send you a link to choose a new password.'}
    >
      {message ? (
        <p role="status" className="text-sm">{message} Check your inbox and spam folder; the link expires in 30 minutes.</p>
      ) : (
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {error && <FormError>{error}</FormError>}
          <Button type="submit" className="w-full" disabled={busy || !email}>{busy ? 'Sending…' : 'Send reset link'}</Button>
        </form>
      )}
      <Link href="/login" className="text-sm text-primary hover:underline">Back to log in</Link>
    </AuthCard>
  );
}
