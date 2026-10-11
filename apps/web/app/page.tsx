import { API_URL } from './api';
import { FeedbackForm } from './feedback-form';

type SearchParams = Record<string, string | undefined>;

interface FeedbackItem {
  id: string;
  body: string;
  rating: number | null;
  upvotes: number;
  created_at: string;
  entity_name: string;
  city: string | null;
  category: string;
}

const FILTER_KEYS = ['category', 'q', 'country', 'city', 'minRating', 'minUpvotes', 'sort', 'cursor'] as const;

// Server component: filters live in the URL (?category=...&minRating=4), so
// every filtered view is shareable, bookmarkable and cacheable.
export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const k of FILTER_KEYS) if (sp[k]) qs.set(k, sp[k]!);

  const [feedRes, catRes] = await Promise.all([
    fetch(`${API_URL}/feedback?${qs}`, { cache: 'no-store' }),
    fetch(`${API_URL}/categories`, { next: { revalidate: 300 } }),
  ]);
  const feed: { items: FeedbackItem[]; nextCursor: string | null } = feedRes.ok
    ? await feedRes.json()
    : { items: [], nextCursor: null };
  const categories: { slug: string; name: string }[] = catRes.ok ? await catRes.json() : [];

  const nextQs = new URLSearchParams(qs);
  if (feed.nextCursor) nextQs.set('cursor', feed.nextCursor);

  return (
    <main>
      <h1>Raw Feedback</h1>

      <form method="get" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <input name="q" placeholder="Search text" defaultValue={sp.q} />
        <select name="category" defaultValue={sp.category ?? ''}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <input name="city" placeholder="City" defaultValue={sp.city} />
        <input name="country" placeholder="Country (IN)" maxLength={2} size={4} defaultValue={sp.country} />
        <select name="minRating" defaultValue={sp.minRating ?? ''}>
          <option value="">Any rating</option>
          {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r}★ and up</option>)}
        </select>
        <input name="minUpvotes" type="number" min={0} placeholder="Min upvotes" defaultValue={sp.minUpvotes} />
        <select name="sort" defaultValue={sp.sort ?? 'newest'}>
          <option value="newest">Newest</option>
          <option value="top">Most upvoted</option>
          <option value="rating">Highest rated</option>
        </select>
        <button type="submit">Filter</button>
      </form>

      {feed.items.length === 0 && <p>No feedback matches these filters.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {feed.items.map((f) => (
          <li key={f.id} style={{ borderBottom: '1px solid #ddd', padding: '12px 0' }}>
            <strong>{f.entity_name}</strong>{f.city ? ` · ${f.city}` : ''} · <em>{f.category}</em>
            {f.rating ? ` · ${'★'.repeat(f.rating)}` : ''} · ▲ {f.upvotes}
            <p style={{ whiteSpace: 'pre-wrap' }}>{f.body}</p>
          </li>
        ))}
      </ul>
      {feed.nextCursor && <a href={`/?${nextQs}`}>Next page →</a>}

      <hr />
      <FeedbackForm />
    </main>
  );
}
