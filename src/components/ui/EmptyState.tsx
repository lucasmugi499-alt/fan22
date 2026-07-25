import type { ReactNode } from 'react';
import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { cn } from '@/lib/utils';
import type { IconComponent } from '@/lib/icons';

/**
 * Empty states explain *why* it is empty and *what happens next* — never a bare "No data".
 * `action` is the single next step (e.g. "Submit a result").
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: IconComponent;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border-strong bg-surface-1 px-6 py-10 text-center',
        className
      )}
    >
      {Icon ? (
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-surface-3 text-muted">
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <p className="text-[15px] font-semibold text-text-strong">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** For a failed load. Keeps the layout stable and offers a retry when one is possible. */
export function ErrorState({
  title = 'Something went wrong',
  description = 'We could not load this right now. Please try again.',
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-[var(--state-error)]/30 bg-[var(--state-error-bg)] px-6 py-10 text-center',
        className
      )}
    >
      <WarningCircle className="mb-3 h-6 w-6 text-[var(--state-error)]" />
      <p className="text-[15px] font-semibold text-text-strong">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted">{description}</p>
      {onRetry ? (
        <button
          onClick={onRetry}
          className="mt-4 rounded-[var(--radius-md)] border border-border-strong bg-surface-1 px-4 h-10 text-sm font-medium text-text-strong hover:bg-surface-3"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
