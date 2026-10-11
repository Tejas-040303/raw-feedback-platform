'use client';

import { useEffect, useId, useRef, useState } from 'react';

// Small shared pieces for the account pages (login, signup, email links).

export const card: React.CSSProperties = {
  maxWidth: 400, margin: '40px auto', padding: 24, border: '1px solid #ddd', borderRadius: 8,
  display: 'grid', gap: 14,
};
export const button: React.CSSProperties = { padding: '10px 14px', fontSize: 16, cursor: 'pointer' };
export const errorText: React.CSSProperties = { color: '#b00020', fontSize: 14, margin: 0 };

/** "15 minutes", "1 hour", "24 hours", from a 429's retryAfterSeconds. */
export function waitText(seconds: number | undefined): string {
  const minutes = Math.max(1, Math.ceil((seconds ?? 3600) / 60));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

/** Labelled input whose error message is announced by screen readers. */
export function Field({ label, error, ...input }: FieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        {...input}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        style={{ padding: 8, fontSize: 16, borderColor: error ? '#b00020' : undefined }}
      />
      {error && <p id={errId} style={errorText}>{error}</p>}
    </div>
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
