import Link from 'next/link';
import { Crest } from '@/components/premium/Crest';
import type { Match, Team } from '@/types';
import { isUpcomingMatch } from '@/lib/status';

/**
 * The broadcast "Next Match" card: home crest, big kickoff time, away crest, with the
 * competition and date beneath. The centrepiece of a club or athlete overview.
 */
export function NextMatchCard({ match, home, away, label = 'Next Match' }: { match: Match; home?: Team; away?: Team; label?: string }) {
  const upcoming = isUpcomingMatch(match);
  const played = match.status === 'completed' || match.status === 'live';
  const centre = upcoming
    ? new Date(match.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : played
      ? `${match.score.home ?? '-'} - ${match.score.away ?? '-'}`
      : 'vs';

  return (
    <Link href={`/matches/${match.id}`} className="block">
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core p-5 transition-colors hover:border-border-strong">
        <p className="mb-4 text-[15px] font-semibold text-text-strong">{label}</p>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex items-center justify-end gap-2.5 text-right">
            <span className="truncate text-sm font-semibold text-text-strong">{home?.name ?? 'Home'}</span>
            <Crest name={home?.name ?? match.homeTeamId} sport={String(match.sport)} size={40} />
          </div>
          <div data-numeric className="tabular min-w-16 text-center text-2xl font-bold tabular-nums text-text-strong">
            {centre}
          </div>
          <div className="flex items-center gap-2.5">
            <Crest name={away?.name ?? match.awayTeamId} sport={String(match.sport)} size={40} />
            <span className="truncate text-sm font-semibold text-text-strong">{away?.name ?? 'Away'}</span>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-subtle">
          {String(match.sport)[0].toUpperCase() + String(match.sport).slice(1)}
          {' · '}
          {new Date(match.scheduledAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          {' · '}
          {match.venue || match.city}
        </p>
      </div>
    </Link>
  );
}
