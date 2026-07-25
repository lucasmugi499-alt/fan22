import type { LeagueStanding } from '@/lib/leagueModel';
import { cn } from '@/lib/utils';

/**
 * League standings. Built only from official results (buildLeagueStandings gates on
 * isOfficialMatch), so a pending scoreline never moves the table. Responsive: a real table
 * on desktop, stacked rows on mobile. `highlightTeamId` marks the viewer's team.
 */
export function StandingsTable({
  rows,
  highlightTeamId,
}: {
  rows: LeagueStanding[];
  highlightTeamId?: string;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core">
      {/* Header row */}
      <div className="grid grid-cols-[28px_1fr_repeat(4,26px)_34px] items-center gap-2 border-b border-border px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-subtle sm:grid-cols-[28px_1fr_repeat(6,32px)_40px]">
        <span>#</span>
        <span>Team</span>
        <span className="text-center">P</span>
        <span className="hidden text-center sm:block">W</span>
        <span className="hidden text-center sm:block">D</span>
        <span className="hidden text-center sm:block">L</span>
        <span className="text-center">GD</span>
        <span className="text-center">Pts</span>
      </div>

      <ul>
        {rows.map((r, i) => {
          const rank = i + 1;
          const mine = r.teamId === highlightTeamId;
          return (
            <li
              key={r.teamId}
              className={cn(
                'grid grid-cols-[28px_1fr_repeat(4,26px)_34px] items-center gap-2 border-b border-border px-3 py-2.5 text-sm last:border-0 sm:grid-cols-[28px_1fr_repeat(6,32px)_40px]',
                mine && 'bg-brand-subtle'
              )}
            >
              <span
                className={cn(
                  'grid h-6 w-6 place-items-center rounded-md text-xs font-bold tabular-nums',
                  rank <= 3 ? 'bg-[var(--state-verified-bg)] text-[var(--state-verified)]' : 'text-muted'
                )}
              >
                {rank}
              </span>
              <span className={cn('truncate font-medium', mine ? 'text-brand' : 'text-text-strong')}>
                {r.teamName}
              </span>
              <Cell>{r.played}</Cell>
              <Cell className="hidden sm:block">{r.wins}</Cell>
              <Cell className="hidden sm:block">{r.draws}</Cell>
              <Cell className="hidden sm:block">{r.losses}</Cell>
              <Cell>{r.difference > 0 ? `+${r.difference}` : r.difference}</Cell>
              <span data-numeric className="text-center text-sm font-bold tabular-nums text-text-strong">
                {r.points}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span data-numeric className={cn('text-center text-sm tabular-nums text-muted', className)}>
      {children}
    </span>
  );
}
