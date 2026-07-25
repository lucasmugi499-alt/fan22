'use client';

import { useState } from 'react';
import { SealCheck, CaretDown, ShieldCheck } from '@phosphor-icons/react';
import { statLabel } from '@/lib/athlete/athleteContext';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

/**
 * Official athlete statistics. These are derived from verified results only and are NOT
 * athlete-editable, which is exactly why they carry weight. Rendered visually distinct from
 * the editable profile, each stamped with its source and a "how this is calculated"
 * disclosure.
 */
export function OfficialStats({ stats, verified }: { stats: Record<string, number>; verified: boolean }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(stats ?? {}).filter(([, v]) => typeof v === 'number');

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-[var(--state-verified-bg)] px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--state-verified)]">
          <ShieldCheck className="h-4 w-4" weight="bold" /> Official record
        </span>
        {verified ? <SealCheck className="h-4 w-4 text-[var(--state-verified)]" weight="fill" /> : null}
      </div>

      {entries.length ? (
        <div className="grid grid-cols-3 gap-px bg-border">
          {entries.map(([key, value]) => (
            <div key={key} className="bg-surface-1 p-3 text-center">
              <p data-numeric className="tabular text-2xl font-bold tabular-nums text-text-strong">{value}</p>
              <p className="mt-0.5 text-[11px] text-muted">{statLabel(key)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="p-4 text-sm text-muted">No official statistics recorded yet.</p>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-left text-xs font-medium text-muted hover:text-text-strong"
      >
        How this is calculated
        <CaretDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <p className="border-t border-border px-4 py-3 text-xs leading-relaxed text-muted">
          These figures come only from matches whose results are official, meaning both teams
          confirmed the score and GoalPlace256 finalized it. Pending or disputed results never
          count. The athlete cannot edit these numbers, which is what makes them trustworthy to
          scouts and sponsors.
        </p>
      ) : null}
    </Card>
  );
}
