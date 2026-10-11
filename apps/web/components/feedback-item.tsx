import Link from 'next/link';
import { timeAgo, type FeedbackItem as Item } from '@/app/api';
import { Badge } from '@/components/ui/badge';
import { Stars } from '@/components/stars';
import { VoteButton } from '@/components/vote-button';

/** One review in a list. Pass showEntity={false} on the entity's own page. */
export function FeedbackItem({ item, categoryName, showEntity = true }: {
  item: Item;
  categoryName?: string;
  showEntity?: boolean;
}) {
  const place = [item.city, item.country_code].filter(Boolean).join(', ');
  return (
    <li className="flex gap-3 p-4">
      <VoteButton feedbackId={item.id} initialCount={item.upvotes} />
      <div className="min-w-0 flex-1">
        {showEntity && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Link href={`/entities/${item.entity_id}`} className="font-semibold hover:underline">{item.entity_name}</Link>
            {place && <span className="text-muted-foreground">{place}</span>}
            {categoryName && <Badge>{categoryName}</Badge>}
          </div>
        )}
        {item.rating && <Stars value={item.rating} className="mt-0.5 block text-sm" />}
        <p className="mt-1 max-w-[65ch] leading-relaxed whitespace-pre-wrap break-words">{item.body}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          <time dateTime={item.created_at}>{timeAgo(item.created_at)}</time>
        </p>
      </div>
    </li>
  );
}
