import Link from 'next/link';
import type { LeagueStanding } from '@/lib/leagueModel';
import type { Match, Team } from '@/types';
import { isOfficialMatch, isStillToPlay } from '@/lib/status';
import { useNow } from '@/lib/useNow';
import { Crest } from '@/components/premium/Crest';
import { cn } from '@/lib/utils';
import { sportDisplayName, standingCellValue, standingColumns, standingZoneFor } from '@/lib/sportPresentation';

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

function nextFor(teamId: string, matches: Match[], teamById: Map<string, Team>, now: number): Team | undefined {
  const next = matches
    .filter((m) => (m.homeTeamId === teamId || m.awayTeamId === teamId) && isStillToPlay(m, now))
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
  const now = useNow();
  const columns = standingColumns(sport);
  const leader = rows[0];
  // Footnoted under the table rather than crammed into a column, so the reason is readable
  // and the table keeps its shape on a phone.
  const adjusted = rows.filter((row) => Boolean(row.adjustment));
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-text-strong">{sportDisplayName(sport)} table</p>
        <p className="text-xs text-muted">Official results only</p>
      </div>
      {/*
        One table at every width, not a table plus a card list.
        The phone layout used to collapse to three columns and stack form badges under each
        club, which doubled the row height and read as a card list. A published table keeps
        its core columns — Pl W D L GD Pts — at phone width and drops only the supporting
        ones, which is what Sky and ESPN do on the same screens.
      */}
      <div className="min-w-0 max-w-full overflow-x-auto [scrollbar-width:thin]">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wide text-subtle sm:text-[11px]">
              <th className="w-8 px-1.5 py-2.5 text-center sm:w-12 sm:px-3 sm:py-3">#</th>
              <th className="min-w-0 px-1 py-2.5 sm:min-w-52 sm:px-3 sm:py-3">Club</th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'w-9 px-1 py-2.5 text-center sm:w-16 sm:px-2 sm:py-3',
                    column.priority === 'extended' && 'hidden sm:table-cell',
                  )}
                >
                  {column.label}
                </th>
              ))}
              <th className="hidden w-28 px-2 py-3 text-center md:table-cell">Form</th>
              <th className="hidden w-16 px-2 py-3 text-center md:table-cell">Next</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const rank = i + 1;
              const mine = r.teamId === highlightTeamId;
              const teamSport = sportById?.(r.teamId);
              const form = formFor(r.teamId, matches);
              const next = nextFor(r.teamId, matches, teamById, now);
              // A published table marks a zone with a rule across the boundary, not a
              // coloured tag on every row in it. The rule sits under the last row of the
              // band, so it reads as a division rather than a decoration.
              const band = standingZoneFor(rank, rows.length);
              const nextBand = standingZoneFor(rank + 1, rows.length);
              const boundary = rank < rows.length && band !== nextBand;
              const cell = 'border-t border-border px-1 py-2 sm:px-2 sm:py-3';
              return (
                <tr
                  key={r.teamId}
                  className={cn(
                    'group',
                    mine && 'bg-brand-subtle',
                    boundary && '[&>td]:!border-b-2 [&>td]:!border-b-border-strong',
                  )}
                >
                  <td className={cn(cell, 'text-center', mine && 'bg-surface-2')}>
                    <span data-numeric className="text-xs font-bold tabular-nums text-muted sm:text-sm">{rank}</span>
                  </td>
                  <td className={cn(cell, 'min-w-0', mine && 'bg-surface-2')}>
                    <Link href={`/teams/${r.teamId}`} className="flex min-w-0 items-center gap-1.5 hover:underline sm:gap-2.5">
                      <span className="shrink-0"><Crest name={r.teamName} sport={teamSport} size={22} /></span>
                      <span className={cn('truncate font-semibold', mine ? 'text-brand' : 'text-text-strong')}>{r.teamName}</span>
                      {/*
                        A points adjustment has to be visible on the row it moved, or the table
                        is quietly wrong in the reader's eyes: a club sitting below a rival it
                        out-scored, with nothing on screen explaining why. Marked here and
                        footnoted below, which is how a published table does it.
                      */}
                      {r.adjustment ? (
                        <sup
                          className="shrink-0 font-bold text-[var(--state-warning)]"
                          title={`${r.adjustment > 0 ? '+' : ''}${r.adjustment} points by league ruling`}
                        >
                          *
                        </sup>
                      ) : null}
                    </Link>
                  </td>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      data-numeric
                      className={cn(
                        cell,
                        'text-center tabular-nums text-muted',
                        column.priority === 'extended' && 'hidden sm:table-cell',
                        column.key === 'points' && 'font-bold text-text-strong',
                        column.key === 'difference' && r.difference > 0 && 'text-[var(--state-verified)]',
                        column.key === 'gb' && 'text-subtle',
                      )}
                    >
                      {standingCellValue(r, column.key, leader)}
                    </td>
                  ))}
                  <td className={cn(cell, 'hidden md:table-cell')}>
                    <span className="flex items-center justify-center gap-0.5">
                      {form.length ? form.map((f, k) => (
                        <span key={k} className={cn('grid h-4 w-4 place-items-center rounded-[3px] text-[9px] font-bold', FORM_COLOR[f])}>{f}</span>
                      )) : <span className="text-xs text-subtle">-</span>}
                    </span>
                  </td>
                  <td className={cn(cell, 'hidden md:table-cell')}>
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
      {adjusted.length ? (
        <div className="border-t border-border px-3 py-2.5 text-xs text-muted">
          {adjusted.map((row) => (
            <p key={row.teamId}>
              <span className="font-bold text-[var(--state-warning)]">*</span>{' '}
              <span className="font-medium text-text-strong">{row.teamName}</span>{' '}
              {row.adjustment > 0 ? 'awarded' : 'deducted'}{' '}
              <span className="tabular-nums">{Math.abs(row.adjustment)}</span>{' '}
              {Math.abs(row.adjustment) === 1 ? 'point' : 'points'} by league ruling.
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
