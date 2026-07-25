import { Wrench } from '@phosphor-icons/react/dist/ssr';

/**
 * Honest placeholder for a destination whose full rebuild lands in a later phase. It exists
 * so navigation never dead-ends in a 404 during the staged rebuild — and it says plainly
 * that it is not finished, rather than faking content.
 */
export function PagePlaceholder({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase?: string;
}) {
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-surface-3 text-muted">
        <Wrench className="h-6 w-6" />
      </span>
      <h1 className="text-xl font-semibold text-text-strong">{title}</h1>
      <p className="mt-2 text-sm text-muted">{description}</p>
      <p className="mt-4 inline-block rounded-[var(--radius-pill)] border border-border bg-surface-1 px-3 py-1 text-xs font-medium text-subtle">
        {phase ?? 'Being rebuilt in a later phase'}
      </p>
    </div>
  );
}
