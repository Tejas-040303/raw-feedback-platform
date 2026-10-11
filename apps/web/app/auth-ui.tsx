'use client';

import { useId } from 'react';

// Small shared pieces for the login and signup pages.

export const card: React.CSSProperties = {
  maxWidth: 400, margin: '40px auto', padding: 24, border: '1px solid #ddd', borderRadius: 8,
  display: 'grid', gap: 14,
};
export const button: React.CSSProperties = { padding: '10px 14px', fontSize: 16, cursor: 'pointer' };
export const errorText: React.CSSProperties = { color: '#b00020', fontSize: 14, margin: 0 };

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
