'use client';

import { useEffect, useId, useState } from 'react';
import { API_URL, type Category, type Entity } from '@/app/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';

export const entityLabel = (e: Pick<Entity, 'name' | 'city' | 'country_code'>) =>
  [e.name, e.city, e.country_code].filter(Boolean).join(' · ');

/**
 * "What are you reviewing?" Pick a category, type a name, then choose an
 * existing entry or add a new one. Adding goes through the API's duplicate
 * checks: an exact match is reused, and near matches are offered so people
 * pick "Domino's Pizza" instead of creating "Dominos" next to it.
 */
export function EntityPicker({ categories, value, onChange }: {
  categories: Category[];
  value: Entity | null;
  onChange: (entity: Entity | null) => void;
}) {
  const id = useId();
  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [matches, setMatches] = useState<Entity[]>([]);
  const [similar, setSimilar] = useState<Entity[] | null>(null);   // from a POSSIBLE_DUPLICATE answer
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const category = categories.find((c) => c.id === categoryId);
  const slug = category?.slug;
  const trimmed = name.trim();

  // Search as the user types. Waits 300 ms after the last keystroke and
  // aborts the previous request, so a slow answer for "Dom" can't arrive
  // after the answer for "Domino" and overwrite it.
  useEffect(() => {
    setSimilar(null);
    if (!slug || trimmed.length < 2) {
      setMatches([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const qs = new URLSearchParams({ category: slug, q: trimmed, limit: '8' });
      try {
        const res = await fetch(`${API_URL}/entities?${qs}`, { signal: controller.signal });
        if (res.ok) setMatches(await res.json());
      } catch {
        // Aborted (a newer search replaced it) or offline: keep the old list.
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [slug, trimmed]);

  async function addNew(confirmNew: boolean) {
    if (!category) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/entities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ categoryId: Number(category.id), name: trimmed, city: city.trim() || undefined, confirmNew }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return onChange(data);
      if (res.status === 409 && data.code === 'DUPLICATE' && data.existing) return onChange(data.existing);
      if (res.status === 409 && data.code === 'POSSIBLE_DUPLICATE') return setSimilar(data.candidates ?? []);
      if (res.status === 401) return setError('Log in to add a new entry.');
      if (res.status === 403) return setError('Confirm your email address before adding entries.');
      setError(data.message ?? 'Could not add this entry. Please try again.');
    } catch {
      setError('Could not reach the server. Is the API running?');
    } finally {
      setBusy(false);
    }
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md bg-accent px-3 py-2 text-sm">
        <span className="min-w-0">Reviewing <strong>{entityLabel(value)}</strong></span>
        <Button variant="link" size="sm" className="h-auto px-0" onClick={() => onChange(null)}>Change</Button>
      </div>
    );
  }

  const exactMatch = matches.some((m) => m.name.trim().toLowerCase() === trimmed.toLowerCase()
    && (m.city ?? '').toLowerCase() === city.trim().toLowerCase());

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-cat`}>Category</Label>
        <NativeSelect id={`${id}-cat`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Choose a category…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-city`}>City <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input id={`${id}-city`} value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Pune" disabled={!category} />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off"
          placeholder={category ? 'e.g. the restaurant, company, place or office' : 'Choose a category first'} disabled={!category} />
      </div>

      {similar ? (
        <div role="alert" className="grid gap-2 rounded-md border border-warning bg-warning-soft p-3 text-sm sm:col-span-2">
          <p className="font-medium">Did you mean one of these?</p>
          {similar.map((e) => (
            <Button key={e.id} variant="outline" className="h-auto justify-start py-2 text-left whitespace-normal" onClick={() => onChange(e)}>
              {entityLabel(e)}
            </Button>
          ))}
          <Button variant="ghost" className="justify-start" onClick={() => addNew(true)} disabled={busy}>
            No, “{trimmed}” is different. Add it
          </Button>
        </div>
      ) : (
        category && trimmed.length >= 2 && (
          <div className="grid gap-1 sm:col-span-2">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {matches.length ? 'Already on Raw Feedback' : 'No match yet'}
            </p>
            {matches.map((e) => (
              <button key={e.id} type="button" onClick={() => onChange(e)}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <span className="min-w-0"><strong>{e.name}</strong>{e.city && <span className="text-muted-foreground"> · {e.city}</span>}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{e.feedback_count} reviews</span>
              </button>
            ))}
            {!exactMatch && (
              <button type="button" onClick={() => addNew(false)} disabled={busy}
                className="rounded-md border border-dashed px-3 py-2 text-left text-sm text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-50">
                + Add “{[trimmed, city.trim()].filter(Boolean).join(', ')}” as a new {category.name} entry
              </button>
            )}
          </div>
        )
      )}
      {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
    </div>
  );
}
