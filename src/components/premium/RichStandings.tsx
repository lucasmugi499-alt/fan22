import Link from 'next/link';
import type { LeagueStanding } from '@/lib/leagueModel';
import type { Match, Team } from '@/types';
import { isOfficialMatch, isUpcomingMatch } from '@/lib/status';
import { Crest } from '@/components/premium/Crest';
import { cn } from '@/lib/utils';
import { sportDisplayName, standingCellValue, standingColumns } from '@/lib/sportPresentation';

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
  sport,
  highlightTeamId,
}: {
  rows: LeagueStanding[];
  matches: Match[];
  teamById: Map<string, Team>;
  sportById?: (teamId: string) => string | undefined;
  sport?: string;
  highlightTeamId?: string;
}) {
  const columns = standingColumns(sport);
  const leader = rows[0];
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-text-strong">{sportDisplayName(sport)} table</p>
        <p className="text-xs text-muted">Official results only</p>
      </div>
      <div className="overflow-x-auto [scrollbar-width:thin]">
        <table className="min-w-[780px] w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
              <th className="sticky left-0 z-10 w-12 bg-surface-1 px-3 py-3">#</th>
              <th className="sticky left-12 z-10 min-w-52 bg-surface-1 px-3 py-3">Club</th>
              {columns.map((column) => (
                <th key={column.key} className="w-16 px-2 py-3 text-center">{column.label}</th>
              ))}
              <th className="w-28 px-2 py-3 text-center">Form</th>
              <th className="w-16 px-2 py-3 text-center">Next</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const rank = i + 1;
              const mine = r.teamId === highlightTeamId;
              const teamSport = sportById?.(r.teamId);
              const form = formFor(r.teamId, matches);
              const next = nextFor(r.teamId, matches, teamById);
              const zone = rank <= 4 ? 'bg-[var(--state-verified)]' : rank >= rows.length - 2 ? 'bg-[var(--state-disputed)]' : 'bg-transparent';
              return (
                <tr key={r.teamId} className={cn('group border-b border-border', mine && 'bg-brand-subtle')}>
                  <td className={cn('sticky left-0 z-10 border-t border-border bg-surface-1 px-3 py-3', mine && '!bg-surface-2')}>
                    <span className="relative flex items-center gap-1.5">
                      <span className={cn('absolute -left-3 h-7 w-1 rounded-r', zone)} aria-hidden />
                      <span data-numeric className="tabular text-sm font-bold tabular-nums text-muted">{rank}</span>
                    </span>
                  </td>
                  <td className={cn('sticky left-12 z-10 border-t border-border bg-surface-1 px-3 py-3', mine && '!bg-surface-2')}>
                    <Link href={`/teams/${r.teamId}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
                      <Crest name={r.teamName} sport={teamSport} size={28} />
                      <span className={cn('max-w-40 truncate font-semibold', mine ? 'text-brand' : 'text-text-strong')}>{r.teamName}</span>
                    </Link>
                  </td>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      data-numeric
                      className={cn(
                        'border-t border-border px-2 py-3 text-center tabular-nums text-muted',
                        column.key === 'points' && 'font-bold text-text-strong',
                        column.key === 'difference' && r.difference > 0 && 'text-[var(--state-verified)]',
                        column.key === 'gb' && 'text-subtle',
                      )}
                    >
                      {standingCellValue(r, column.key, leader)}
                    </td>
                  ))}
                  <td className="border-t border-border px-2 py-3">
                    <span className="flex items-center justify-center gap-0.5">
                      {form.length ? form.map((f, k) => (
                        <span key={k} className={cn('grid h-4 w-4 place-items-center rounded-[3px] text-[9px] font-bold', FORM_COLOR[f])}>{f}</span>
                      )) : <span className="text-xs text-subtle">-</span>}
                    </span>
                  </td>
                  <td className="border-t border-border px-2 py-3">
                    <span className="flex justify-center">
                      {next ? <Crest name={next.name} sport={String(next.sport)} size={24} /> : <span className="text-xs text-subtle">-</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
