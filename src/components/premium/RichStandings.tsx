import Link from 'next/link';
import type { LeagueStanding } from '@/lib/leagueModel';
import type { Match, Team } from '@/types';
import { isOfficialMatch, isUpcomingMatch } from '@/lib/status';
import { Crest } from '@/components/premium/Crest';
import { cn } from '@/lib/utils';

type FormResult = 'W' | 'D' | 'L';

function formFor(teamId: string, matches: Match[]): FormResult[] {
  return matches
    .filter((m) => (m.homeTeamId === teamId || m.awayTeamId === teamId) && isOfficialMatch(m) && m.score.home !== null && m.score.away !== null)
    .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt))
    .slice(0, 5)
    .reverse()
    .map((m) => {
      const home = m.homeTeamId === teamId;
      const own = (home ? m.score.home : m.score.away) ?? 0;
      const opp = (home ? m.score.away : m.score.home) ?? 0;
      return own > opp ? 'W' : own < opp ? 'L' : 'D';
    });
}

function nextFor(teamId: string, matches: Match[], teamById: Map<string, Team>): Team | undefined {
  const next = matches
    .filter((m) => (m.homeTeamId === teamId || m.awayTeamId === teamId) && isUpcomingMatch(m))
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))[0];
  if (!next) return undefined;
  return teamById.get(next.homeTeamId === teamId ? next.awayTeamId : next.homeTeamId);
}

const FORM_COLOR: Record<FormResult, string> = {
  W: 'bg-[var(--state-verified)] text-black',
  D: 'bg-surface-3 text-muted',
  L: 'bg-[var(--state-disputed)] text-black',
};

/**
 * The full league table, broadcast-grade: rank, crest + club, Pl W D L GF GA GD Pts, recent
 * form dots, and the next opponent's crest. Built only from official results. Extra columns
 * collapse on mobile so it never overflows 390px.
 */
export function RichStandings({
  rows,
  matches,
  teamById,
  sportById,
  highlightTeamId,
}: {
  rows: LeagueStanding[];
  matches: Match[];
  teamById: Map<string, Team>;
  sportById?: (teamId: string) => string | undefined;
  highlightTeamId?: string;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core">
      <div className="grid grid-cols-[28px_1fr_repeat(2,26px)_38px] items-center gap-2 border-b border-border px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-subtle sm:grid-cols-[28px_1fr_repeat(7,30px)_44px_110px_46px]">
        <span>#</span>
        <span>Club</span>
        <Cell className="hidden sm:block">Pl</Cell>
        <Cell className="hidden sm:block">W</Cell>
        <Cell className="hidden sm:block">D</Cell>
        <Cell className="hidden sm:block">L</Cell>
        <Cell className="hidden sm:block">GF</Cell>
        <Cell>GA</Cell>
        <Cell className="hidden sm:block">GD</Cell>
        <Cell>Pts</Cell>
        <Cell className="hidden sm:block">Form</Cell>
        <Cell className="hidden sm:block">Next</Cell>
      </div>

      <ul>
        {rows.map((r, i) => {
          const rank = i + 1;
          const mine = r.teamId === highlightTeamId;
          const sport = sportById?.(r.teamId);
          const form = formFor(r.teamId, matches);
          const next = nextFor(r.teamId, matches, teamById);
          const zone = rank <= 4 ? 'bg-[var(--state-verified)]' : rank >= rows.length - 2 ? 'bg-[var(--state-disputed)]' : 'bg-transparent';
          return (
            <li
              key={r.teamId}
              className={cn(
                'grid grid-cols-[28px_1fr_repeat(2,26px)_38px] items-center gap-2 border-b border-border px-3 py-2.5 text-sm last:border-0 sm:grid-cols-[28px_1fr_repeat(7,30px)_44px_110px_46px]',
                mine && 'bg-brand-subtle'
              )}
            >
              <span className="relative flex items-center gap-1.5">
                <span className={cn('absolute -left-3 h-6 w-1 rounded-r', zone)} aria-hidden />
                <span data-numeric className="tabular text-sm font-bold tabular-nums text-muted">{rank}</span>
              </span>
              <Link href={`/teams/${r.teamId}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
                <Crest name={r.teamName} sport={sport} size={26} />
                <span className={cn('truncate font-medium', mine ? 'text-brand' : 'text-text-strong')}>{r.teamName}</span>
              </Link>
              <Cell className="hidden sm:block">{r.played}</Cell>
              <Cell className="hidden sm:block">{r.wins}</Cell>
              <Cell className="hidden sm:block">{r.draws}</Cell>
              <Cell className="hidden sm:block">{r.losses}</Cell>
              <Cell className="hidden sm:block">{r.pointsFor}</Cell>
              <Cell>{r.pointsAgainst}</Cell>
              <Cell className="hidden sm:block">{r.difference > 0 ? `+${r.difference}` : r.difference}</Cell>
              <span data-numeric className="text-center text-sm font-bold tabular-nums text-text-strong">{r.points}</span>
              <span className="hidden items-center justify-center gap-0.5 sm:flex">
                {form.length ? form.map((f, k) => (
                  <span key={k} className={cn('grid h-4 w-4 place-items-center rounded-[3px] text-[9px] font-bold', FORM_COLOR[f])}>{f}</span>
                )) : <span className="text-xs text-subtle">-</span>}
              </span>
              <span className="hidden justify-center sm:flex">
                {next ? <Crest name={next.name} sport={String(next.sport)} size={24} /> : <span className="text-xs text-subtle">-</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span data-numeric className={cn('text-center text-sm tabular-nums text-muted', className)}>{children}</span>;
}
