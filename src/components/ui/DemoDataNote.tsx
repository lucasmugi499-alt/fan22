import { Info } from '@phosphor-icons/react/dist/ssr';

/**
 * Labels any surface showing seed/demo figures. A verification product must never present
 * demonstration numbers as live traction (brief constraint 5).
 */
export function DemoDataNote({ className }: { className?: string }) {
  return (
    <p
      className={
        'flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2 text-xs text-muted ' +
        (className ?? '')
      }
    >
      <Info className="h-4 w-4 shrink-0 text-subtle" weight="bold" />
      Demonstration data. Figures are seeded for this preview, not live traction.
    </p>
  );
}
