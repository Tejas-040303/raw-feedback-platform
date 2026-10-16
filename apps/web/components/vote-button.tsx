'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { API_URL } from '@/app/api';
import { cn } from '@/lib/utils';

/**
 * Upvote toggle. Updates the count immediately (optimistic), then calls the
 * API and rolls back if the call fails.
 *
 * Known gap: the feed doesn't yet say which posts *you* already upvoted, so
 * after a reload every arrow starts un-highlighted. The API is idempotent,
 * so upvoting again never counts twice.
 */
export function VoteButton({ feedbackId, initialCount }: { feedbackId: string; initialCount: number }) {
  const router = useRouter();
  const [voted, setVoted] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  async function toggle() {
    if (busy) return;
    const next = !voted;
    setBusy(true);
    setHint('');
    setVoted(next);
    setCount((c) => c + (next ? 1 : -1));
    try {
      const res = await fetch(`${API_URL}/feedback/${feedbackId}/upvote`, {
        method: next ? 'POST' : 'DELETE',
        credentials: 'include',
      });
      if (res.ok) return;
      setVoted(!next);
      setCount((c) => c - (next ? 1 : -1));
      if (res.status === 401) return router.push('/login');
      if (res.status === 403) setHint('Confirm your email to upvote');
    } catch {
      setVoted(!next);
      setCount((c) => c - (next ? 1 : -1));
      setHint('Offline');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-10 shrink-0 flex-col items-center gap-0.5 pt-0.5">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={voted}
        aria-label={voted ? 'Remove upvote' : 'Upvote'}
        className={cn(
          'grid size-8 place-items-center rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
          voted ? 'bg-accent text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2 L13 10 H1 Z" fill="currentColor" /></svg>
      </button>
      <span className={cn('text-sm font-semibold tabular-nums', voted && 'text-primary')}>{count}</span>
      {hint && <span role="status" className="w-24 text-center text-[11px] leading-tight text-warning">{hint}</span>}
    </div>
  );
}
