import Link from 'next/link';
import { apiGet, type Category, type Entity, type FeedPage } from './api';
import { FeedbackItem } from '@/components/feedback-item';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';

type SearchParams = Record<string, string | undefined>;

const FILTER_KEYS = ['category', 'q', 'country', 'city', 'minRating', 'minUpvotes', 'sort', 'cursor'] as const;
const SORTS = [['top', 'Most upvoted'], ['newest', 'Newest'], ['rating', 'Highest rated']] as const;

// Server component. Filters live in the URL (?category=...&minRating=4), so
// every filtered view is shareable, bookmarkable and cacheable.
export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const k of FILTER_KEYS) if (sp[k]) qs.set(k, sp[k]!);

  const [feed, categories, popular] = await Promise.all([
    apiGet<FeedPage>(`/feedback?${qs}`, { cache: 'no-store' }),
    apiGet<Category[]>('/categories', { next: { revalidate: 300 } }),
    apiGet<Entity[]>('/entities?sort=popular&limit=5', { next: { revalidate: 60 } }),
  ]);
  const categoryName = new Map((categories ?? []).map((c) => [c.slug, c.name]));

  /** Link to the current view with some params changed (undefined removes one). Always drops the cursor. */
  const withParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(qs);
    next.delete('cursor');
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
    const s = next.toString();
    return s ? `/?${s}` : '/';
  };

  const sort = sp.sort ?? 'newest';
  const activeFilters = ([
    ['q', sp.q && `“${sp.q}”`],
    ['city', sp.city],
    ['country', sp.country?.toUpperCase()],
    ['minRating', sp.minRating && `${sp.minRating}★ and up`],
    ['minUpvotes', sp.minUpvotes && `${sp.minUpvotes}+ upvotes`],
  ] as const).filter(([, label]) => label);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[180px_minmax(0,1fr)_260px]">
      {/* Categories: a column on desktop, a scrollable row on phones */}
      <aside className="min-w-0">
        <h2 className="mb-2 hidden text-xs font-semibold tracking-wider text-muted-foreground uppercase lg:block">Categories</h2>
        <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible" aria-label="Categories">
          {[{ slug: undefined, name: 'All' }, ...(categories ?? [])].map((c) => {
            const active = (sp.category ?? undefined) === c.slug;
            return (
              <Link
                key={c.slug ?? 'all'}
                href={withParams({ category: c.slug })}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm whitespace-nowrap hover:bg-muted',
                  active && 'bg-accent font-semibold text-accent-foreground hover:bg-accent',
                )}
              >
                {c.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      <section className="min-w-0" aria-label="Reviews">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <nav className="flex rounded-md border bg-card p-0.5 text-sm" aria-label="Sort">
            {SORTS.map(([key, label]) => (
              <Link
                key={key}
                href={withParams({ sort: key === 'newest' ? undefined : key })}
                aria-current={sort === key ? 'true' : undefined}
                className={cn('rounded px-3 py-1', sort === key ? 'bg-muted font-semibold' : 'text-muted-foreground hover:text-foreground')}
              >
                {label}
              </Link>
            ))}
          </nav>
          {activeFilters.map(([key, label]) => (
            <Link key={key} href={withParams({ [key]: undefined })} className="rounded-full border bg-card px-3 py-1 text-sm hover:bg-muted" aria-label={`Remove filter ${label}`}>
              {label} <span aria-hidden="true">✕</span>
            </Link>
          ))}
        </div>

        <details className="group mb-4 rounded-md border bg-card">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium select-none">More filters</summary>
          <form method="get" className="grid gap-3 border-t p-4 sm:grid-cols-2">
            {sp.category && <input type="hidden" name="category" value={sp.category} />}
            {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
            <label className="grid gap-1 text-sm">Search text
              <Input name="q" defaultValue={sp.q} placeholder="e.g. refund, parking" />
            </label>
            <label className="grid gap-1 text-sm">City
              <Input name="city" defaultValue={sp.city} placeholder="e.g. Pune" />
            </label>
            <label className="grid gap-1 text-sm">Country code
              <Input name="country" defaultValue={sp.country} placeholder="IN" maxLength={2} />
            </label>
            <label className="grid gap-1 text-sm">Rating
              <NativeSelect name="minRating" defaultValue={sp.minRating ?? ''}>
                <option value="">Any rating</option>
                {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r}★ and up</option>)}
              </NativeSelect>
            </label>
            <label className="grid gap-1 text-sm">Minimum upvotes
              <Input name="minUpvotes" type="number" min={0} defaultValue={sp.minUpvotes} />
            </label>
            <div className="flex items-end gap-2">
              <button type="submit" className={buttonVariants()}>Apply</button>
              <Link href="/" className={buttonVariants({ variant: 'ghost' })}>Clear all</Link>
            </div>
          </form>
        </details>

        {feed === null ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Couldn't load reviews. Check that the API is running (<code>npm run dev:api</code>).
          </Card>
        ) : feed.items.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No reviews match these filters yet.{' '}
            <Link href="/write" className="font-medium text-primary hover:underline">Write the first one</Link>
          </Card>
        ) : (
          <ol className="divide-y overflow-hidden rounded-lg border bg-card">
            {feed.items.map((item) => (
              <FeedbackItem key={item.id} item={item} categoryName={categoryName.get(item.category)} />
            ))}
          </ol>
        )}
        {feed?.nextCursor && (
          <div className="mt-4 text-center">
            <Link href={`/?${new URLSearchParams({ ...Object.fromEntries(qs), cursor: feed.nextCursor })}`} className={buttonVariants({ variant: 'outline' })}>
              Next page
            </Link>
          </div>
        )}
      </section>

      <aside className="hidden min-w-0 space-y-4 lg:block">
        <Card className="p-4">
          <h2 className="font-display text-base font-semibold">Most reviewed</h2>
          {popular?.length ? (
            <ol className="mt-3 space-y-2 text-sm">
              {popular.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-2">
                  <Link href={`/entities/${e.id}`} className="truncate hover:underline">{e.name}</Link>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{e.feedback_count}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Nothing reviewed yet.</p>
          )}
        </Card>
        <Card className="p-4 text-sm">
          <h2 className="font-display text-base font-semibold">How posting works</h2>
          <ul className="mt-2 space-y-1.5 text-muted-foreground">
            <li>Be as blunt as you like about the service.</li>
            <li>Don't insult or threaten people. If a post crosses the line, we suggest a version you can post instead.</li>
            <li>Phone numbers and emails are removed automatically.</li>
          </ul>
        </Card>
      </aside>
    </div>
  );
}
