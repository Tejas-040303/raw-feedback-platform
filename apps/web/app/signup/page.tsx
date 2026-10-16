'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { API_URL } from '../api';
import { PASSWORD_RULES, validateSignup, type SignupErrors, type SignupInput } from '../account-rules';
import { AuthCard, Field, FormError, PasswordChecklist, waitText } from '../auth-ui';
import { Button } from '@/components/ui/button';

const EMPTY: SignupInput = { name: '', dateOfBirth: '', email: '', username: '', password: '', confirmPassword: '' };

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState<SignupInput>(EMPTY);
  // Errors only appear for fields the user has left (or after a submit
  // attempt), so the form doesn't shout at people while they're typing.
  const [touched, setTouched] = useState<Partial<Record<keyof SignupInput, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<SignupErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const errors = validateSignup(form);
  const shown = (k: keyof SignupInput) => serverErrors[k] ?? (touched[k] ? errors[k] : undefined);

  const bind = (k: keyof SignupInput) => ({
    name: k,
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm({ ...form, [k]: e.target.value });
      setServerErrors({ ...serverErrors, [k]: undefined });
    },
    onBlur: () => setTouched({ ...touched, [k]: true }),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, dateOfBirth: true, email: true, username: true, password: true, confirmPassword: true });
    setFormError('');
    if (Object.keys(errors).length) return;

    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (res.ok) {
        router.push('/');
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setFormError(`Too many accounts have been created from your network. Please try again in ${waitText(data.retryAfterSeconds)}.`);
        return;
      }
      if (data.errors) setServerErrors(data.errors);   // e.g. username taken
      else setFormError('Something went wrong. Please try again.');
    } catch {
      setFormError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <AuthCard title="Create account" className="max-w-md">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field className="sm:col-span-2" label="Name" autoComplete="name" {...bind('name')} error={shown('name')} />
        <Field label="Date of birth" type="date" max={today} autoComplete="bday" {...bind('dateOfBirth')} error={shown('dateOfBirth')} />
        <Field label="Username" autoComplete="username" {...bind('username')} error={shown('username')} />
        <Field className="sm:col-span-2" label="Email" type="email" autoComplete="email" {...bind('email')} error={shown('email')} />
        {/* No maxLength on the password inputs: the browser would silently cut a
            pasted 20-character password to 14 in BOTH fields, they'd still
            match, and the account would get a password the user doesn't know.
            The checklist flags it instead. */}
        <Field
          className="sm:col-span-2"
          label="Password"
          type="password"
          autoComplete="new-password"
          {...bind('password')}
          error={serverErrors.password}
        />
        <div className="sm:col-span-2">
          <PasswordChecklist rules={PASSWORD_RULES} password={form.password} showMisses={!!touched.password} />
        </div>
        <Field
          className="sm:col-span-2"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          {...bind('confirmPassword')}
          error={shown('confirmPassword')}
        />
        {formError && <div className="sm:col-span-2"><FormError>{formError}</FormError></div>}
        <Button type="submit" className="w-full sm:col-span-2" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account? <Link href="/login" className="text-primary hover:underline">Log in</Link>
      </p>
    </AuthCard>
  );
}
