import Link from 'next/link';
import { athletePhoto } from '@/lib/media';
import { SealCheck, Users, TrendUp, MapPin, Trophy } from '@phosphor-icons/react/dist/ssr';
import type { Athlete, League, Team } from '@/types';
import type { LeagueStanding } from '@/lib/leagueModel';
import { cn } from '@/lib/utils';

function ugx(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}

const SPORT_VAR: Record<string, string> = {
  football: 'var(--football)',
  basketball: 'var(--basketball)',
  rugby: 'var(--rugby)',
};
function sportColor(sport: string): string {
  return SPORT_VAR[sport.toLowerCase()] ?? 'var(--brand)';
}

/** Athlete discovery card. Real photography via a stable per-athlete seed. */
export function AthleteCard({ athlete, className }: { athlete: Athlete; className?: string }) {
  const accent = sportColor(String(athlete.sport));
  const photo = athletePhoto(athlete);
  return (
    <Link
      href={`/athletes/${athlete.id}`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core shadow-e1 transition-[transform,border-color] duration-[var(--dur-micro)] ease-[var(--ease-fluid)] hover:-translate-y-0.5 hover:border-border-strong',
        className
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo}
          alt={athlete.name}
          className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-fluid)] group-hover:scale-105"
          loading="lazy"
        />
        <span className="absolute left-2 top-2 rounded-[var(--radius-pill)] bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white" style={{ color: accent }}>
          {String(athlete.sport)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-text-strong">{athlete.name}</span>
          {athlete.verified ? <SealCheck className="h-4 w-4 shrink-0 text-[var(--state-verified)]" weight="fill" /> : null}
        </div>
        <span className="truncate text-xs text-muted">{athlete.position} · {athlete.city}</span>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--brand-2)]">
          <TrendUp className="h-3.5 w-3.5" weight="bold" />
          <span className="tabular tabular-nums font-semibold">UGX {ugx(athlete.totalSupport)}</span>
          <span className="text-subtle">raised</span>
        </div>
      </div>
    </Link>
  );
}

/**
 * Compact team row/card.
 *
 * `standing` is the row computed from official results. When present it supplies BOTH the
 * points and the W-D-L record, because the two must come from the same place: the stored
 * `team.leaguePoints` and `team.wins/draws/losses` are seeded aggregates that do not derive
 * from any match, so mixing a computed points total with a stored record produced cards
 * reading "3-0-10 · 19pts" beside a league table showing the same club on zero.
 *
 * Without a standing the card falls back to the stored fields, which is all a surface that
 * has not loaded a table can do.
 */
export function TeamCard({
  team,
  className,
  standing,
  rank,
  leagueName,
}: {
  team: Team;
  className?: string;
  standing?: Pick<LeagueStanding, 'points' | 'wins' | 'draws' | 'losses'>;
  rank?: number;
  leagueName?: string;
}) {
  const accent = sportColor(String(team.sport));
  const points = standing?.points ?? team.leaguePoints;
  const record = standing
    ? `${standing.wins}-${standing.draws}-${standing.losses}`
    : team.record ?? `${team.wins}-${team.draws ?? 0}-${team.losses}`;
  return (
    <Link
      href={`/teams/${team.id}`}
      className={cn(
        'group flex w-full min-w-0 max-w-full items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core p-3 transition-[border-color,transform] duration-[var(--dur-micro)] hover:-translate-y-0.5 hover:border-border-strong',
        className
      )}
    >
      <span
        className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-md)] border text-xs font-bold text-text-strong"
        style={{ borderColor: accent, background: 'var(--surface-3)' }}
      >
        {team.name.slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-text-strong">{team.name}</span>
          {team.verified ? <SealCheck className="h-4 w-4 shrink-0 text-[var(--state-verified)]" weight="fill" /> : null}
        </div>
        <span className="block truncate text-xs text-muted">
          {leagueName ? `${leagueName} · ` : ''}{team.city} · <span className="tabular tabular-nums">{record}</span>
        </span>
        {rank ? (
          <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand">
            <Trophy className="h-3.5 w-3.5" weight="bold" /> #{rank} table position
          </span>
        ) : null}
      </div>
      <span data-numeric className="shrink-0 text-right text-sm font-bold tabular-nums text-brand">
        {points}
        <span className="ml-1 text-[10px] font-medium uppercase text-subtle">pts</span>
      </span>
    </Link>
  );
}

/** League discovery card with its GoalPlace Index. */
export function LeagueCard({
  league,
  className,
  leaderName,
  officialMatches,
}: {
  league: League;
  className?: string;
  leaderName?: string;
  officialMatches?: number;
}) {
  const accent = sportColor(String(league.sport));
  return (
    <Link
      href={`/leagues/${league.id}`}
      className={cn(
        'group flex min-h-40 w-full min-w-0 max-w-full flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core p-4 transition-[border-color,transform] duration-[var(--dur-micro)] hover:-translate-y-0.5 hover:border-border-strong',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-text-strong">{league.name}</span>
            {league.verified ? <SealCheck className="h-4 w-4 shrink-0 text-[var(--state-verified)]" weight="fill" /> : null}
          </div>
          <span className="flex min-w-0 items-center gap-1 text-xs text-muted"><MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{league.city} · {String(league.sport)}</span></span>
        </div>
        <span className="shrink-0 rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: 'var(--surface-3)', color: accent }}>
          {league.status}
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> <span className="tabular tabular-nums">{league.teamsCount}</span> teams</span>
        <span className="inline-flex items-center gap-1">
          <span className="tabular tabular-nums font-semibold text-text-strong">{league.goalPlaceIndex}</span> index
        </span>
      </div>
      <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs">
        <span>
          <span className="block text-[10px] uppercase text-subtle">Leader</span>
          <span className="block truncate font-semibold text-text-strong">{leaderName ?? 'Table forming'}</span>
        </span>
        <span className="text-right">
          <span className="block text-[10px] uppercase text-subtle">Official</span>
          <span data-numeric className="font-semibold tabular-nums text-text-strong">{officialMatches ?? 0} matches</span>
        </span>
      </div>
    </Link>
  );
}
