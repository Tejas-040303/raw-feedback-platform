import { cn } from '@/lib/utils';

export function Stars({ value, className }: { value: number; className?: string }) {
  const full = Math.round(value);
  return (
    <span className={cn('text-star tracking-tight', className)} role="img" aria-label={`${value} out of 5 stars`}>
      {'★'.repeat(full)}
      <span className="text-border">{'★'.repeat(5 - full)}</span>
    </span>
  );
}
