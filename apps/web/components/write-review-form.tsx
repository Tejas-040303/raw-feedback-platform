'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { API_URL, type Category, type Entity } from '@/app/api';
import { EntityPicker } from '@/components/entity-picker';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const RATING_WORDS = ['', 'Terrible', 'Poor', 'Okay', 'Good', 'Excellent'];

interface Rejection {
  explanation: string;
  suggestedRewrite: string | null;
}

type Result =
  | { kind: 'posted'; entityId: string }
  | { kind: 'held' }
  | { kind: 'error'; message: string }
  | { kind: 'verify' }
  | null;

export function WriteReviewForm({ categories, initialEntity }: { categories: Category[]; initialEntity: Entity | null }) {
  const router = useRouter();
  const id = useId();
  const [entity, setEntity] = useState<Entity | null>(initialEntity);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    setRejection(null);
    if (!entity) return setResult({ kind: 'error', message: 'First choose what you are reviewing.' });
    if (!body.trim()) return setResult({ kind: 'error', message: 'Write a few words about what happened.' });

    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include', // sends the session cookie to the API
        body: JSON.stringify({ entityId: Number(entity.id), body, rating: rating || undefined }),
      });
      // An error page or empty body isn't JSON; don't let that throw.
      const data = await res.json().catch(() => ({}));
      if (res.status === 422 && data.code === 'ABUSIVE_CONTENT') {
        setRejection({ explanation: data.explanation, suggestedRewrite: data.suggestedRewrite });
      } else if (res.status === 401) {
        setResult({ kind: 'error', message: 'Log in to post a review.' });
      } else if (res.status === 403 && data.code === 'EMAIL_NOT_VERIFIED') {
        setResult({ kind: 'verify' });
      } else if (res.status === 404 && data.code === 'ENTITY_NOT_FOUND') {
        setEntity(null);
        setResult({ kind: 'error', message: 'That entry no longer exists. Please choose it again.' });
      } else if (res.status === 202) {
        setResult({ kind: 'held' });
        setBody('');
      } else if (res.ok) {
        setResult({ kind: 'posted', entityId: entity.id });
        setBody('');
        setRating(0);
        router.refresh();
      } else if (res.status === 400 && data.errors) {
        setResult({ kind: 'error', message: Object.values(data.errors).join(' ') });
      } else {
        setResult({ kind: 'error', message: data.message ?? `Something went wrong (HTTP ${res.status}).` });
      }
    } catch {
      // fetch only throws when no response arrived at all: API down, wrong
      // URL, or a CORS rejection (e.g. the site opened as 127.0.0.1 instead
      // of localhost).
      setResult({ kind: 'error', message: `Could not reach the server at ${API_URL}. Is the API running?` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 grid gap-5" noValidate>
      <Card className="p-4">
        <fieldset className="grid gap-3">
          <legend className="mb-3 text-sm font-semibold">1 · What are you reviewing?</legend>
          <EntityPicker categories={categories} value={entity} onChange={setEntity} />
        </fieldset>
      </Card>

      <Card className="p-4">
        <fieldset className="grid gap-3">
          <legend className="mb-3 text-sm font-semibold">2 · Your review</legend>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                onClick={() => setRating(rating === n ? 0 : n)}
                className={cn('text-2xl leading-none transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded',
                  n <= rating ? 'text-star' : 'text-border')}
              >
                ★
              </button>
            ))}
            <span className="ml-2 text-sm text-muted-foreground">{rating ? RATING_WORDS[rating] : 'No rating (optional)'}</span>
          </div>
          <label htmlFor={`${id}-body`} className="sr-only">Review text</label>
          <Textarea
            id={`${id}-body`}
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Say what actually happened. Be as blunt as you like about the service; don't attack people."
          />
        </fieldset>
      </Card>

      {rejection && (
        <div role="alert" className="rounded-lg border border-warning bg-warning-soft p-4 text-sm">
          <p className="font-semibold text-warning">This can't be posted as written.</p>
          <p className="mt-1">{rejection.explanation}</p>
          {rejection.suggestedRewrite ? (
            <>
              <p className="mt-3">Here is a version you can post instead:</p>
              <blockquote className="mt-2 max-w-[65ch] rounded-md border bg-card p-3 leading-relaxed whitespace-pre-wrap">
                {rejection.suggestedRewrite}
              </blockquote>
              <div className="mt-3 flex flex-wrap gap-2">
                {/* Puts the rewrite in the editor; the user still reviews it and posts it, and it's checked again. */}
                <Button onClick={() => { setBody(rejection.suggestedRewrite!); setRejection(null); }}>Use this version</Button>
                <Button variant="outline" onClick={() => setRejection(null)}>Edit it myself</Button>
              </div>
            </>
          ) : (
            <p className="mt-2">Please rewrite your post without this content.</p>
          )}
        </div>
      )}

      {result && (
        <div role={result.kind === 'error' ? 'alert' : 'status'}
          className={cn('rounded-lg border p-4 text-sm', result.kind === 'error' ? 'border-destructive/40 text-destructive' : 'bg-card')}>
          {result.kind === 'posted' && (
            <p><strong className="text-success">Posted.</strong> See it on <Link href={`/entities/${result.entityId}`} className="font-medium text-primary hover:underline">the review page</Link> or <Link href="/" className="font-medium text-primary hover:underline">the feed</Link>.</p>
          )}
          {result.kind === 'held' && <p><strong>Thanks!</strong> Your review is being checked and will appear shortly.</p>}
          {result.kind === 'verify' && <p className="text-foreground">Confirm your email address before posting. Use the link we emailed you, or resend it from the banner at the top.</p>}
          {result.kind === 'error' && <p>{result.message}</p>}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Link href="/" className="px-3 text-sm text-muted-foreground hover:text-foreground">Cancel</Link>
        <Button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Post review'}</Button>
      </div>
    </form>
  );
}
