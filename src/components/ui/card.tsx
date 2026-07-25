import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * The base surface. Opaque dark core with a concentric inset highlight so it reads as
 * machined hardware rather than a flat rectangle. Depth comes from the highlight + a
 * tinted shadow, never from backdrop-blur on scrolling content (perf on mid-range Android).
 */
export function Card({
  className,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border border-border bg-surface-1 shadow-e1 bezel-core',
        interactive &&
          'transition-[box-shadow,transform,border-color] duration-[var(--dur-micro)] ease-[var(--ease-fluid)] hover:-translate-y-0.5 hover:border-border-strong hover:shadow-e2',
        className
      )}
      {...props}
    />
  );
}

/**
 * The double-bezel (Doppelrand): an outer shell holding an inner core with its own radius
 * and highlight, for hero/priority moments that should feel physically enclosed. Reserve
 * for the one or two most important surfaces per screen.
 */
export function Bezel({
  className,
  innerClassName,
  glow = false,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { innerClassName?: string; glow?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-2xl)] border border-border bg-surface-glass p-1.5',
        glow && 'border-[color:var(--border-glow)] shadow-[var(--glow-brand)]',
        className
      )}
      {...props}
    >
      <div
        className={cn(
          'rounded-[calc(var(--radius-2xl)-6px)] bg-surface-1 bezel-core',
          innerClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-3 p-4 pb-0', className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-[15px] font-semibold text-text-strong', className)} {...props} />;
}

export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle', className)}
      {...props}
    />
  );
}
