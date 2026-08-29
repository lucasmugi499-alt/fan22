'use client';

import { useMemo } from 'react';
import { Warning, CalendarBlank, Megaphone, SealCheck, Trophy } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { teamsInLeague, matchesInLeague } from '@/lib/league/leagueContext';
import { resolveLeagueStandings } from '@/lib/standings/resolve';
import { currentSeasonFor, scoringForSeason } from '@/lib/season';
import { GradientBanner } from '@/components/premium/GradientBanner';
import { RichStandings } from '@/components/premium/RichStandings';
import { NewsRow } from '@/components/premium/NewsRow';
import { AthleteCard, TeamCard } from '@/components/core/EntityCards';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { DemoDataNote } from '@/components/ui/DemoDataNote';
import { FollowButton } from '@/components/core/FollowButton';
import { MatchCard } from '@/components/core/MatchCard';
import { isOfficialMatch, isUpcomingMatch } from '@/lib/status';
import { getSportTheme } from '@/lib/sportThemes';
import { LeagueNoticeList } from '@/components/core/LeagueNoticeList';
import type { Athlete, FeedPost, League, LeagueNotice, Match, Season, StoredStanding, Team } from '@/types';
import { SnapRow } from '@/components/ui/ScrollRail';

const SPORT_BANNER: Record<string, 'brand' | 'gold' | 'broadcast' | 'pitch'> = {
  football: 'pitch',
  basketball: 'gold',
  rugby: 'broadcast',
};

type InitialLeaguePublicData = {
  league?: League;
  teams?: Team[];
  matches?: Match[];
  seasons?: Season[];
  athletes?: Athlete[];
  feedPosts?: FeedPost[];
  leagueNotices?: LeagueNotice[];
  standings?: StoredStanding[];
};

/**
 * The client match limit, named rather than inlined.
 *
 * It is passed to the standings resolver so that a fallback computation can tell a complete
 * season from a page of one. Previously this number silently decided how much of a league's
 * season appeared in its published table.
 */
const RELATED_RECORD_LIMIT = 120;

export function LeaguePublic({
  leagueId,
  initialData,
}: {
  leagueId: string;
  initialData?: InitialLeaguePublicData;
}) {
  const exact = useGoalPlaceData({
    collections: ['leagues'],
    scope: { leagueId },
  });
  const league = useMemo(
    () => exact.leagues.find((item) => item.id === leagueId) ?? initialData?.league,
    [exact.leagues, initialData?.league, leagueId],
  );
  const related = useGoalPlaceData({
    collections: ['teams', 'matches', 'seasons', 'athletes', 'leagueNotices', 'standings'],
    scope: { leagueId, audience: 'public' },
    recordLimit: RELATED_RECORD_LIMIT,
  });
  const newsData = useGoalPlaceData({
    collections: ['feedPosts'],
    scope: { leagueId, audience: 'public' },
    recordLimit: 12,
  });
  const teams = useMemo(() => related.teams.length ? related.teams : initialData?.teams ?? [], [initialData?.teams, related.teams]);
  const matches = useMemo(() => related.matches.length ? related.matches : initialData?.matches ?? [], [initialData?.matches, related.matches]);
  const seasons = useMemo(() => related.seasons.length ? related.seasons : initialData?.seasons ?? [], [initialData?.seasons, related.seasons]);
  const athletes = useMemo(() => related.athletes.length ? related.athletes : initialData?.athletes ?? [], [initialData?.athletes, related.athletes]);
  const leagueNotices = useMemo(() => related.leagueNotices.length ? related.leagueNotices : initialData?.leagueNotices ?? [], [initialData?.leagueNotices, related.leagueNotices]);
  const storedStandings = useMemo(() => related.standings.length ? related.standings : initialData?.standings ?? [], [initialData?.standings, related.standings]);
  const feedPosts = useMemo(() => newsData.feedPosts.length ? newsData.feedPosts : initialData?.feedPosts ?? [], [initialData?.feedPosts, newsData.feedPosts]);
  const loading = !initialData?.league && (exact.loading || (Boolean(league) && related.loading));
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const lTeams = useMemo(() => teamsInLeague(leagueId, teams), [teams, leagueId]);
  const news = useMemo(() => feedPosts.filter((p) => p.relatedLeagueId === leagueId), [feedPosts, leagueId]);
  const leagueMatches = useMemo(() => matchesInLeague(leagueId, matches), [leagueId, matches]);
  const upcoming = useMemo(() => leagueMatches.filter(isUpcomingMatch).sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)).slice(0, 4), [leagueMatches]);
  const official = useMemo(() => leagueMatches.filter(isOfficialMatch).sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt)), [leagueMatches]);
  const leaders = useMemo(() => athletes.filter((athlete) => athlete.leagueId === leagueId).sort((a, b) => b.goalPlacePoints - a.goalPlacePoints).slice(0, 4), [athletes, leagueId]);
  const notices = useMemo(() => leagueNotices.filter((notice) => notice.leagueId === leagueId).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 4), [leagueId, leagueNotices]);
  const sportTheme = getSportTheme(league?.sport);
  /**
   * The table, from the server projection wherever one exists.
   *
   * This used to compute the whole table in the browser from `matches` — which is whatever
   * page of the season the client had loaded, at most 120 documents, replacing the 240 the
   * server had already sent. Past roughly 120 fixtures the published table was built from an
   * arbitrary subset, and an anonymous visitor and a signed-in one saw different tables of
   * the same league.
   *
   * `resolveLeagueStandings` prefers the stored projection and falls back to computing
   * locally when a season has no rows yet — but the fallback now says so, and says whether
   * the match list it used had hit its limit.
   */
  const standings = useMemo(() => {
    if (!league) {
      return { rows: [], source: 'computed' as const, provisional: false };
    }
    const season = currentSeasonFor(seasons, league.id, league.currentSeasonId);
    return resolveLeagueStandings({
      stored: storedStandings,
      seasonId: season?.id,
      teams: lTeams,
      matches: matchesInLeague(leagueId, matches),
      scoring: season ? scoringForSeason(season, league.sport) : undefined,
      matchLoadLimit: RELATED_RECORD_LIMIT,
    });
  }, [league, lTeams, matches, seasons, leagueId, storedStandings]);
  // The club cards below the table read from this rather than the stored aggregates, so a
  // club cannot show one points total beside a table showing another.
  const standingByTeam = useMemo(
    () => new Map(standings.rows.map((row) => [row.teamId, row])),
    [standings],
  );

  if (loading) return <div className="space-y-4"><Skeleton className="h-32 w-full rounded-[var(--radius-xl)]" /><Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" /></div>;
  if (exact.error) return <ErrorState description="This league could not be loaded. Check your connection and try again." onRetry={exact.retry} />;
  if (!league) return <EmptyState icon={Warning} title="League not found" description="This league may have been removed, or the link is out of date." />;

  return (
    <div className="space-y-5">
      <GradientBanner
        title={league.name}
        subtitle={`${league.city} · ${String(league.sport)[0].toUpperCase() + String(league.sport).slice(1)} · standings from official results only`}
        variant={SPORT_BANNER[String(league.sport).toLowerCase()] ?? 'pitch'}
      >
        <FollowButton targetType="league" targetId={league.id} label="Follow league" />
      </GradientBanner>

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Metric label="Official results" value={String(official.length)} />
        <Metric label="Teams" value={String(lTeams.length)} />
        <Metric label="Athletes" value={String(leaders.length ? league.athletesCount : 0)} />
        <Metric label="Verified rate" value={`${league.verifiedResultsRate}%`} />
      </section>

      <Card className="p-4 md:p-5">
        <p className="text-[11px] font-semibold uppercase text-brand">Season story</p>
        <h2 className="mt-2 text-lg font-semibold text-text-strong">{league.season} at a glance</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          {official.length} matches are official, producing {official.reduce((total, match) => total + (match.score.home ?? 0) + (match.score.away ?? 0), 0)} recorded {sportTheme.scoringNoun}. {leaders[0]?.name ?? 'The leading athlete'} currently leads verified athlete activity, while the competition is reporting a {league.verifiedResultsRate}% result-verification rate.
        </p>
      </Card>

      <section className="space-y-2.5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Official results only</p>
            <h2 className="font-display text-2xl font-semibold text-text-strong">League table</h2>
          </div>
          <span className="rounded-[var(--radius-pill)] border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
            {official.length} official matches
          </span>
        </div>
        <DemoDataNote />
        {standings.provisional ? (
          /**
           * Said out loud, because the alternative is what this whole change removes.
           *
           * The old path could not distinguish a complete season from a page of one, so it
           * rendered both as fact. A table that is quietly wrong is worse than one that
           * admits it is partial — especially for a product whose proposition is verified
           * truth.
           */
          <Card className="border-warning/30 bg-[var(--state-warning-bg)] p-4 text-sm text-muted" role="status">
            <p className="font-semibold text-text-strong">This table may be incomplete.</p>
            <p className="mt-1">
              It was calculated from the {standings.rows.reduce((total, row) => total + row.played, 0) / 2} results
              loaded on this page, and this league has more fixtures than one page holds. The
              verified table is being rebuilt and will appear here shortly.
            </p>
          </Card>
        ) : null}
        {standings.rows.length ? (
          <RichStandings
            rows={standings.rows}
            matches={matches}
            teamById={teamById}
            sportById={(id) => String(teamById.get(id)?.sport ?? '')}
            sport={String(league.sport)}
          />
        ) : (
          <Card className="p-4 text-sm text-muted">Standings appear as official results are recorded.</Card>
        )}
      </section>

      {upcoming.length ? (
        <section className="space-y-2.5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-strong"><CalendarBlank className="h-4 w-4 text-brand" /> Upcoming fixtures</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {upcoming.map((match) => <MatchCard key={match.id} match={match} home={teamById.get(match.homeTeamId)} away={teamById.get(match.awayTeamId)} href={`/matches/${match.id}`} />)}
          </div>
        </section>
      ) : null}

      <NewsRow title="League news" posts={news} />
      {newsData.error ? (
        <Card className="p-4 text-sm text-muted">
          League updates are temporarily unavailable. Fixtures and official records are still shown.
        </Card>
      ) : null}

      {leaders.length ? (
        <section className="space-y-2.5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-strong"><Trophy className="h-4 w-4 text-brand-2" /> Players to watch</h2>
          <SnapRow className="-mx-[var(--gutter)] px-[var(--gutter)] md:mx-0 md:px-0">
            {leaders.map((athlete) => <AthleteCard key={athlete.id} athlete={athlete} className="snap-item w-44" />)}
          </SnapRow>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-strong"><Megaphone className="h-4 w-4 text-brand" /> League notices</h2>
          <LeagueNoticeList notices={notices} />
        </Card>
        <Card className="p-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-strong"><SealCheck className="h-4 w-4 text-verified" /> Public competition proof</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Metric label="Official results" value={String(official.length)} compact />
            <Metric label="Verified rate" value={`${league.verifiedResultsRate}%`} compact />
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">Restricted sponsor evidence and allocation records remain inside authorized reporting workspaces.</p>
        </Card>
      </div>

      <section className="space-y-2.5">
        <h2 className="text-[15px] font-semibold text-text-strong">Clubs</h2>
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {lTeams.map((t) => (
            <TeamCard key={t.id} team={t} standing={standingByTeam.get(t.id)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <Card className={compact ? 'bg-surface-2 p-3' : 'p-3.5'}>
      <p data-numeric className={`${compact ? 'text-lg' : 'text-xl'} font-bold text-text-strong`}>{value}</p>
      <p className="mt-1 text-[11px] text-muted">{label}</p>
    </Card>
  );
}
