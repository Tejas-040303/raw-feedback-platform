import type { Metadata } from 'next';
import { apiGet, type Category, type Entity } from '@/app/api';
import { WriteReviewForm } from '@/components/write-review-form';

export const metadata: Metadata = { title: 'Write a review' };

// /write?entity=12 opens with that entry already chosen (the "Review this" button).
export default async function WritePage({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  const { entity: entityId } = await searchParams;
  const [categories, entity] = await Promise.all([
    apiGet<Category[]>('/categories', { next: { revalidate: 300 } }),
    entityId && /^\d+$/.test(entityId) ? apiGet<Entity>(`/entities/${entityId}`, { cache: 'no-store' }) : null,
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-bold tracking-tight">Write a review</h1>
      <p className="mt-1 text-sm text-muted-foreground">Say what actually happened. Be blunt about the service; don't attack people.</p>
      <WriteReviewForm categories={categories ?? []} initialEntity={entity} />
    </div>
  );
}
