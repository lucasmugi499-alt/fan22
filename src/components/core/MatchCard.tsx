import Link from 'next/link';
import { CalendarBlank, MapPin, CaretRight } from '@phosphor-icons/react/dist/ssr';
import type { Match, Team, SportSlug, SportType } from '@/types';
import { isOfficialMatch, isUpcomingMatch } from '@/lib/status';
import { clubColor } from '@/lib/clubColors';
import { MatchStatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';

const SPORT_VAR: Record<string, string> = {
  football: 'var(--football)',
  basketball: 'var(--basketball)',
  rugby: 'var(--rugby)',
};
function sportColor(sport: SportSlug | SportType): string {
  return SPORT_VAR[String(sport).toLowerCase()] ?? 'var(--brand)';
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}
function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function Crest({ team, id }: { team?: Team; id: string }) {
  const name = team?.name ?? id;
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold text-text-strong"
      style={{ borderColor: clubColor(name).primary, background: 'var(--surface-3)' }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function Side({
  team,
  id,
  score,
  played,
  winner,
}: {
  team?: Team;
  id: string;
  score: number | null;
  played: boolean;
  winner: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Crest team={team} id={id} />
        <span
          className={cn(
            'truncate text-sm',
            winner ? 'font-semibold text-text-strong' : played ? 'font-medium text-muted' : 'font-medium text-text-strong'
          )}
        >
          {team?.name ?? 'Team'}
        </span>
      </div>
      <span
        data-numeric
        className={cn(
          'tabular text-xl font-bold tabular-nums',
          score === null ? 'text-subtle' : winner ? 'text-brand' : 'text-text-strong'
        )}
      >
        {score === null ? '-' : score}
      </span>
    </div>
  );
}

/**
 * Broadcast-style match summary. A score is shown as a *claim* carrying its trust badge; an
 * unverified result is captioned so it never reads as official. Standings/stats still gate
 * on `isOfficialMatch`, so surfacing the claimed score here stays honest.
 */
export function MatchCard({
  match,
  home,
  away,
  href,
  onClick,
}: {
  match: Match;
  home?: Team;
  away?: Team;
  href?: string;
  onClick?: () => void;
}) {
  const upcoming = isUpcomingMatch(match);
  const official = isOfficialMatch(match);
  const played = match.status === 'completed' || match.status === 'live';
  const live = match.status === 'live';
  const accent = sportColor(match.sport);

  const hs = played ? match.score.home : null;
  const as = played ? match.score.away : null;
  const homeWin = official && hs !== null && as !== null && hs > as;
  const awayWin = official && hs !== null && as !== null && as > hs;

  const clickable = Boolean(href || onClick);
  const body = (
    <div
      className={cn(
        'group relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core shadow-e1',
        clickable && 'transition-[transform,border-color,box-shadow] duration-[var(--dur-micro)] ease-[var(--ease-fluid)] hover:-translate-y-0.5 hover:border-border-strong hover:shadow-e2'
      )}
    >
      {/* Sport accent edge. */}
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent }} aria-hidden />

      <div className="p-4 pl-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle">
            <CalendarBlank className="h-3.5 w-3.5" />
            {fmtDate(match.scheduledAt)}
            {upcoming ? `, ${fmtTime(match.scheduledAt)}` : ''}
          </span>
          <MatchStatusBadge match={match} size="sm" />
        </div>

        <div className="space-y-2.5">
          <Side team={home} id={match.homeTeamId} score={hs} played={played} winner={homeWin} />
          <Side team={away} id={match.awayTeamId} score={as} played={played} winner={awayWin} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-[11px] text-subtle">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{match.venue || match.city}</span>
          </span>
          {live ? (
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--state-live)]">
              Playing now
            </span>
          ) : played && !official ? (
            <span className="shrink-0 text-[11px] font-semibold text-[var(--state-pending)]">
              Not yet official
            </span>
          ) : clickable ? (
            <CaretRight className="h-4 w-4 shrink-0 text-subtle transition-transform duration-[var(--dur-micro)] ease-[var(--ease-fluid)] group-hover:translate-x-0.5" />
          ) : null}
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block focus-visible:outline-none">
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button onClick={onClick} className="block w-full text-left focus-visible:outline-none">
        {body}
      </button>
    );
  }
  return body;
}
