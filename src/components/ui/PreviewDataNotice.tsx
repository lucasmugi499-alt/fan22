import { Info } from '@phosphor-icons/react/dist/ssr';

import { cn } from '@/lib/utils';
import type { PublicCatalogueSource } from '@/server/publicCatalogue';

/**
 * Discloses that a page is showing the curated preview dataset because a live read
 * failed. Renders nothing on the normal path, so it never decorates a healthy demo —
 * but it makes a backend outage visible instead of letting synthetic records pass as
 * live data.
 *
 * Only `curated_preview` (an actual fallback) is announced. `configured_preview` is
 * deliberate mock mode, where nothing is unavailable and the message would be false.
 * Beta and production never fall back at all; see `publicCatalogue`.
 */
export function PreviewDataNotice({
  source,
  className,
}: {
  source: PublicCatalogueSource;
  className?: string;
}) {
  if (source !== 'curated_preview') return null;

  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2',
        'text-[13px] leading-snug text-[var(--text-muted)]',
        'bg-[var(--state-warning-bg)] border border-[var(--border)]',
        className,
      )}
    >
      <Info weight="fill" className="size-4 shrink-0 text-[var(--state-warning)]" aria-hidden />
      <span>
        Live demo services are temporarily unavailable. Displaying the curated GoalPlace256
        preview dataset.
      </span>
    </div>
  );
}
