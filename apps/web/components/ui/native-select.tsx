import { cn } from '@/lib/utils';

/** A styled native <select>: accessible and mobile-friendly with no extra dependency. */
export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'h-9 w-full rounded-md border border-input bg-card px-2 text-base shadow-xs outline-none md:text-sm',
        'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30',
        className,
      )}
      {...props}
    />
  );
}
