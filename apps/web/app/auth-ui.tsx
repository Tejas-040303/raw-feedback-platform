'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// Shared pieces for the account pages (login, signup, email links).

/** Centred card that holds an account form. */
export function AuthCard({ title, description, children, className }: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('mx-auto mt-6 w-full max-w-sm', className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

export function FormError({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="text-sm text-destructive">{children}</p>;
}

/** "15 minutes", "1 hour", "24 hours", from a 429's retryAfterSeconds. */
export function waitText(seconds: number | undefined): string {
  const minutes = Math.max(1, Math.ceil((seconds ?? 3600) / 60));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

interface FieldProps extends React.ComponentProps<'input'> {
  label: string;
  error?: string;
}

/** Labelled input whose error message is announced by screen readers. */
export function Field({ label, error, className, ...input }: FieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...input} aria-invalid={error ? true : undefined} aria-describedby={error ? errId : undefined} />
      {error && <p id={errId} className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** Live checklist of password rules: green when met, red once the user has tried. */
export function PasswordChecklist({ rules, password, showMisses }: {
  rules: { id: string; label: string; test: (pw: string) => boolean }[];
  password: string;
  showMisses: boolean;
}) {
  return (
    <ul aria-label="Password requirements" className="grid gap-0.5 text-sm sm:grid-cols-2">
      {rules.map((rule) => {
        const ok = rule.test(password);
        return (
          <li key={rule.id} className={ok ? 'text-success' : showMisses ? 'text-destructive' : 'text-muted-foreground'}>
            <span aria-hidden="true">{ok ? '✓' : '○'}</span> {rule.label}
            <span className="sr-only">{ok ? ' (met)' : ' (not met)'}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Reads ?token=... from the email link, then removes it from the address
 * bar so it doesn't stay in browser history or get shared by copy-paste.
 */
export function useTokenFromUrl(): string | null | undefined {
  // undefined = not read yet (first render), null = no token in the URL.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  // React runs effects twice in development (Strict Mode). Without this
  // guard the second run would find the token already stripped from the URL
  // and report "missing token".
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const url = new URL(window.location.href);
    setToken(url.searchParams.get('token'));
    url.searchParams.delete('token');
    window.history.replaceState(null, '', url.pathname + url.search);
  }, []);
  return token;
}
