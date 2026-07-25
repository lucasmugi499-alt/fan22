import { CaretRight } from '@phosphor-icons/react/dist/ssr';
import type { StateDescriptor } from '@/lib/statusSystem';
import { TONE_CLASS } from '@/lib/statusSystem';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';

/**
 * A row in an exception queue (league verification, platform approvals). Leads with the
 * trust state, names the thing, and offers one action. Exception queues only, not a list of
 * every normal result.
 */
export function QueueItem({
  state,
  title,
  subtitle,
  meta,
  onClick,
}: {
  state: StateDescriptor;
  title: string;
  subtitle: string;
  meta?: string;
  onClick?: () => void;
}) {
  const Icon = state.icon;
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core p-3 text-left',
        onClick &&
          'transition-[border-color,transform] duration-[var(--dur-micro)] ease-[var(--ease-fluid)] hover:-translate-y-0.5 hover:border-border-strong'
      )}
    >
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full border', TONE_CLASS[state.tone])}>
        <Icon className="h-5 w-5" weight="bold" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-strong">{title}</p>
        <p className="truncate text-xs text-muted">{subtitle}</p>
        {meta ? <p className="mt-0.5 truncate text-[11px] text-subtle">{meta}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge state={state} size="sm" />
        {onClick ? <CaretRight className="h-4 w-4 text-subtle" /> : null}
      </div>
    </Wrapper>
  );
}
