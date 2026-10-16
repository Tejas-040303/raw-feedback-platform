import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiGet, type Category, type Entity, type FeedPage } from '@/app/api';
import { FeedbackItem } from '@/components/feedback-item';
import { Stars } from '@/components/stars';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ sort?: string; cursor?: string }> };

const SORTS = [['top', 'Most upvoted'], ['newest', 'Newest'], ['rating', 'Highest rated']] as const;

async function loadEntity(id: string) {
  if (!/^\d+$/.test(id)) return null;
  return apiGet<Entity>(`/entities/${id}`, { cache: 'no-store' });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const entity = await loadEntity((await params).id);
  return { title: entity?.name ?? 'Not found' };
}

export default async function EntityPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const entity = await loadEntity(id);
  if (!entity) notFound();

  const sort = sp.sort ?? 'top';
  const qs = new URLSearchParams({ entityId: id, sort });
  if (sp.cursor) qs.set('cursor', sp.cursor);
  const [feed, categories] = await Promise.all([
    apiGet<FeedPage>(`/feedback?${qs}`, { cache: 'no-store' }),
    apiGet<Category[]>('/categories', { next: { revalidate: 300 } }),
  ]);
  const category = categories?.find((c) => c.id === entity.category_id);
  const avg = entity.avg_rating === null ? null : Number(entity.avg_rating);
  const place = [entity.city, entity.region, entity.country_code].filter(Boolean).join(', ');

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to feed</Link>

      <Card className="mt-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {category && <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{category.name}</p>}
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">{entity.name}</h1>
            {place && <p className="mt-1 text-sm text-muted-foreground">{place}</p>}
          </div>
          <Link href={`/write?entity=${entity.id}`} className={buttonVariants()}>Review this</Link>
        </div>
        <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <p className="font-display text-4xl font-bold tabular-nums">{avg === null ? '–' : avg.toFixed(1)}</p>
            {avg !== null && <Stars value={avg} />}
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">
            {entity.rating_count} rating{entity.rating_count === 1 ? '' : 's'} · {entity.feedback_count} review{entity.feedback_count === 1 ? '' : 's'}
          </p>
        </div>
      </Card>

      <div className="mt-6 mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Reviews</h2>
        <nav className="flex rounded-md border bg-card p-0.5 text-sm" aria-label="Sort">
          {SORTS.map(([key, label]) => (
            <Link
              key={key}
              href={`/entities/${id}?sort=${key}`}
              aria-current={sort === key ? 'true' : undefined}
              className={cn('rounded px-3 py-1', sort === key ? 'bg-muted font-semibold' : 'text-muted-foreground hover:text-foreground')}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>

      {!feed?.items.length ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No reviews yet. <Link href={`/write?entity=${entity.id}`} className="font-medium text-primary hover:underline">Be the first</Link>
        </Card>
      ) : (
        <ol className="divide-y overflow-hidden rounded-lg border bg-card">
          {feed.items.map((item) => <FeedbackItem key={item.id} item={item} showEntity={false} />)}
        </ol>
      )}
      {feed?.nextCursor && (
        <div className="mt-4 text-center">
          <Link href={`/entities/${id}?sort=${sort}&cursor=${encodeURIComponent(feed.nextCursor)}`} className={buttonVariants({ variant: 'outline' })}>
            Next page
          </Link>
        </div>
      )}
    </div>
  );
}
