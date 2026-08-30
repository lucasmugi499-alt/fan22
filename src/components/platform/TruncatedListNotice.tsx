'use client';

import { Warning } from '@phosphor-icons/react';
import type { GoalPlaceDataCollection } from '@/lib/firebase/useGoalPlaceData';

/**
 * Says that a list is not all of it.
 *
 * Every operator directory loads a fixed number of records — 120 to 700 depending on the
 * screen — and filters them in the browser. At demo scale that is the whole catalogue. At
 * 10,000 leagues and 1.8 million athletes it is the first few hundred, and nothing on the
 * screen says so: a platform admin searching a directory that silently holds 500 of 1.8
 * million records will conclude the athlete is not registered.
 *
 * That is the same class of failure as the league table computed from a truncated match list,
 * on a different surface. This does not paginate those directories — that is a larger piece of
 * work — but it stops them presenting a slice as the whole.
 *
 * Points at search rather than at a bigger limit, because search is the operator's actual
 * workflow at scale. Nobody scrolls 1.8 million rows; they look for one person.
 */
export function TruncatedListNotice({
  truncated,
  label,
}: {
  /** From `useGoalPlaceData().truncated`. Renders nothing when empty. */
  truncated: GoalPlaceDataCollection[];
  /** What the reader calls this list, when the collection name is not the right word. */
  label?: string;
}) {
  if (!truncated.length) return null;
  const names = label ? [label] : truncated;

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-[var(--radius-md)] border border-warning/30 bg-[var(--state-warning-bg)] px-3 py-2 text-xs text-muted"
    >
      <Warning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" weight="bold" />
      <p>
        <span className="font-semibold text-text-strong">
          Showing the most recent {names.join(', ')}.
        </span>{' '}
        This list is capped and there are likely more. Use search to find a specific record.
      </p>
    </div>
  );
}
