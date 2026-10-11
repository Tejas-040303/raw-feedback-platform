'use client';

import { useState } from 'react';
import { API_URL } from './api';

interface Rejection {
  explanation: string;
  suggestedRewrite: string | null;
}

export function FeedbackForm() {
  const [entityId, setEntityId] = useState('');
  const [body, setBody] = useState('');
  const [rating, setRating] = useState('');
  const [message, setMessage] = useState('');
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    setRejection(null);
    try {
      const res = await fetch(`${API_URL}/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include', // send the session cookie to the API
        body: JSON.stringify({ entityId: Number(entityId), body, rating: rating ? Number(rating) : undefined }),
      });
      const data = await res.json();
      if (res.status === 422 && data.code === 'ABUSIVE_CONTENT') {
        setRejection({ explanation: data.explanation, suggestedRewrite: data.suggestedRewrite });
      } else if (res.status === 401) {
        setMessage('Please log in to post feedback.');
      } else if (res.status === 202) {
        setMessage('Thanks! Your feedback is being reviewed and will appear shortly.');
        setBody('');
      } else if (res.ok) {
        setMessage('Posted.');
        setBody('');
      } else {
        setMessage(data.message ?? 'Something went wrong.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 8 }}>
      <h2>Post feedback</h2>
      <input placeholder="Entity id" value={entityId} onChange={(e) => setEntityId(e.target.value)} required />
      <textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} required
        placeholder="Say what actually happened. Be as blunt as you like, just don't attack people." />
      <select value={rating} onChange={(e) => setRating(e.target.value)}>
        <option value="">No rating</option>
        {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r}★</option>)}
      </select>

      {rejection && (
        <div role="alert" style={{ border: '1px solid #c60', padding: 12 }}>
          <p>{rejection.explanation}</p>
          {rejection.suggestedRewrite ? (
            <>
              <p>Here is a version you can post instead:</p>
              <blockquote style={{ whiteSpace: 'pre-wrap' }}>{rejection.suggestedRewrite}</blockquote>
              {/* Puts the rewrite in the editor; the user still reviews and submits it, and it is moderated again. */}
              <button type="button" onClick={() => { setBody(rejection.suggestedRewrite!); setRejection(null); }}>
                Use this version
              </button>
            </>
          ) : (
            <p>Please rewrite your post without this content.</p>
          )}
        </div>
      )}

      <button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Post'}</button>
      {message && <p>{message}</p>}
    </form>
  );
}
