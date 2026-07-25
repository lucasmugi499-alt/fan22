import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Loading placeholder. Pulse respects reduced-motion (globals disables the animation).
 * Every data surface renders a skeleton in its shape while `loading` is true — never a
 * spinner-over-empty layout that shifts when data lands.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-[var(--radius-sm)] bg-surface-3', className)}
      {...props}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-brand',
        className
      )}
    />
  );
}
