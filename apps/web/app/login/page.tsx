'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { API_URL } from '../api';
import { AuthCard, Field, FormError, waitText } from '../auth-ui';
import { Button } from '@/components/ui/button';

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
        setError(`Too many failed attempts. Please try again in ${waitText(data.retryAfterSeconds ?? 900)}.`);
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
    <AuthCard title="Log in">
      <form onSubmit={submit} className="grid gap-4" noValidate>
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
        {error && <FormError>{error}</FormError>}
        <Button type="submit" className="w-full" disabled={busy || !identifier || !password}>
          {busy ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">Forgot your password?</Link>
        <Link href="/signup" className="text-primary hover:underline">Create an account</Link>
      </div>
    </AuthCard>
  );
}
