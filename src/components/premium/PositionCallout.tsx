import Link from 'next/link';
import { CaretUp, CaretDown, Minus } from '@phosphor-icons/react/dist/ssr';
import type { LeagueStanding } from '@/lib/leagueModel';
import type { Team } from '@/types';
import { Crest } from '@/components/premium/Crest';
import { cn } from '@/lib/utils';

function ordinal(n: number): { num: string; suffix: string } {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return { num: String(n), suffix: s[(v - 20) % 10] || s[v] || s[0] };
}

/**
 * The club-page position block: an oversized ordinal ("2ⁿᵈ"), a movement indicator, and a
 * compact slice of the table centred on the club. Mirrors how broadcast club pages surface
 * standing at a glance.
 */
export function PositionCallout({
  rows,
  teamId,
  sportById,
  href = '/leagues',
}: {
  rows: LeagueStanding[];
  teamId: string;
  sportById?: (teamId: string) => string | undefined;
  href?: string;
}) {
  const idx = rows.findIndex((r) => r.teamId === teamId);
  if (idx === -1) return null;
  const pos = idx + 1;
  const ord = ordinal(pos);
  // Window of five centred on the club.
  const start = Math.max(0, Math.min(idx - 2, rows.length - 5));
  const window = rows.slice(start, start + 5);

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core p-4">
      <Link href={href} className="mb-3 flex items-center gap-1.5 text-[15px] font-semibold text-text-strong hover:text-brand">
        Table <CaretUp className="h-3.5 w-3.5 rotate-90" />
      </Link>

      <div className="mb-4 flex items-end justify-between">
        <p className="font-display text-5xl font-bold leading-none text-text-strong">
          {ord.num}
          <sup className="text-2xl">{ord.suffix}</sup>
        </p>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
          {pos <= 4 ? <CaretUp className="h-3.5 w-3.5 text-[var(--state-verified)]" weight="bold" /> : pos >= rows.length - 2 ? <CaretDown className="h-3.5 w-3.5 text-[var(--state-disputed)]" weight="bold" /> : <Minus className="h-3.5 w-3.5" />}
          {pos <= 4 ? 'Top four' : pos >= rows.length - 2 ? 'Drop zone' : 'Mid-table'}
        </span>
      </div>

      <ul className="space-y-px">
        {window.map((r) => {
          const rank = rows.indexOf(r) + 1;
          const mine = r.teamId === teamId;
          return (
            <li key={r.teamId} className={cn('flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-2', mine && 'bg-brand-subtle')}>
              <span data-numeric className="w-5 text-center text-sm font-bold tabular-nums text-muted">{rank}</span>
              <Crest name={r.teamName} sport={sportById?.(r.teamId)} size={24} />
              <span className={cn('min-w-0 flex-1 truncate text-sm font-medium', mine ? 'text-brand' : 'text-text-strong')}>{r.teamName}</span>
              <span data-numeric className="text-sm font-bold tabular-nums text-text-strong">{r.points}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
