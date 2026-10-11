'use client';

import Link from 'next/link';
import { useState } from 'react';
import { API_URL } from '../api';
import { passwordProblems, PASSWORD_RULES } from '../account-rules';
import { AuthCard, Field, FormError, PasswordChecklist, useTokenFromUrl } from '../auth-ui';
import { Button } from '@/components/ui/button';

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
      <AuthCard title="Reset password">
        <FormError>This link is missing its code. <Link href="/forgot-password" className="underline">Request a new link</Link>.</FormError>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Password changed">
        <p role="status" className="text-sm">
          Your password has been updated and you’ve been logged out on all devices.{' '}
          <Link href="/login" className="text-primary hover:underline">Log in</Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <PasswordChecklist rules={PASSWORD_RULES} password={password} showMisses={false} />
        <Field
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={mismatch ? 'Passwords don’t match.' : undefined}
        />
        {error && (
          <FormError>
            {error}{' '}
            {/expired|already been used|invalid/i.test(error) && <Link href="/forgot-password" className="underline">Request a new link</Link>}
          </FormError>
        )}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Saving…' : 'Set new password'}</Button>
      </form>
    </AuthCard>
  );
}
