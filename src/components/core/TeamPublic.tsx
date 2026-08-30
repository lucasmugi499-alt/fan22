'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { MapPin, Warning, CalendarBlank, Coins, Users, Trophy, Heart, Handshake } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveLeagueStandings } from '@/lib/standings/resolve';
import { currentSeasonFor, scoringForSeason } from '@/lib/season';
import { isOfficialMatch, isStillToPlay } from '@/lib/status';
import { useNow } from '@/lib/useNow';
import { clubColor } from '@/lib/clubColors';
import { IdentityHero } from '@/components/premium/IdentityHero';
import { NextMatchCard } from '@/components/premium/NextMatchCard';
import { PositionCallout } from '@/components/premium/PositionCallout';
import { SquadGrid } from '@/components/premium/SquadGrid';
import { NewsRow } from '@/components/premium/NewsRow';
import { Crest } from '@/components/premium/Crest';
import { MatchCard } from '@/components/core/MatchCard';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { FollowButton } from '@/components/core/FollowButton';

function ugx(n: number): string {
  if (n >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `UGX ${(n / 1_000).toFixed(0)}k`;
  return `UGX ${n}`;
}

/**
 * The client match limit, named so the standings resolver can tell a complete season from a
 * page of one. See LeaguePublic for the same constant and the same reason.
 */
const LEAGUE_RECORD_LIMIT = 250;

export function TeamPublic({ teamId }: { teamId: string }) {
  const now = useNow();
  const exact = useGoalPlaceData({
    collections: ['teams'],
    scope: { teamId },
  });
  const team = exact.teams.find((item) => item.id === teamId);
  const profileData = useGoalPlaceData({
    collections: ['athletes', 'matches', 'leagues', 'seasons', 'supportNeeds', 'sponsors'],
    scope: { teamId },
    recordLimit: 120,
  });
  const newsData = useGoalPlaceData({
    collections: ['feedPosts'],
    scope: { teamId },
    recordLimit: 12,
  });
  const {
    athletes,
    matches: profileMatches,
    leagues,
    seasons: profileSeasons,
    supportNeeds,
    sponsors,
  } = profileData;
  const feedPosts = newsData.feedPosts;
  const league = useMemo(() => leagues.find((l) => l.id === team?.leagueId), [leagues, team]);
  const leagueData = useGoalPlaceData({
    collections: ['teams', 'matches', 'seasons', 'standings'],
    scope: { leagueId: league?.id ?? 'goalplace-pending' },
    recordLimit: LEAGUE_RECORD_LIMIT,
  });
  const teams = league?.id ? leagueData.teams : exact.teams;
  const matches = league?.id ? leagueData.matches : profileMatches;
  const seasons = league?.id ? leagueData.seasons : profileSeasons;
  const loading = exact.loading
    || (Boolean(team) && profileData.loading)
    || (Boolean(league?.id) && leagueData.loading);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const roster = useMemo(() => athletes.filter((a) => a.teamId === teamId), [athletes, teamId]);
  const teamMatches = useMemo(() => matches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId), [matches, teamId]);
  const nextMatch = useMemo(() => teamMatches.filter((m) => isStillToPlay(m, now)).sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))[0], [teamMatches, now]);
  const results = useMemo(() => teamMatches.filter(isOfficialMatch).sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt)).slice(0, 3), [teamMatches]);
  const pendingResults = useMemo(() => teamMatches.filter((m) => m.status === 'completed' && !isOfficialMatch(m)).sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt)).slice(0, 3), [teamMatches]);
  const news = useMemo(() => feedPosts.filter((p) => p.relatedTeamId === teamId), [feedPosts, teamId]);
  const needs = useMemo(() => supportNeeds.filter((need) => need.teamId === teamId), [supportNeeds, teamId]);
  const partners = useMemo(() => sponsors.filter((sponsor) => sponsor.supportedTeamIds.includes(teamId)), [sponsors, teamId]);

  /**
   * The club's league position, from the same projection the league page reads.
   *
   * It matters that this is the same source rather than a second computation: a club showing
   * one record beside a league table showing another is the failure the codebase already
   * guards against elsewhere by preferring the computed table over stored team aggregates.
   * Two independent computations over two different match pages would reintroduce it.
   */
  const standings = useMemo(() => {
    if (!league) return { rows: [], source: 'computed' as const, provisional: false };
    const lTeams = teams.filter((t) => t.leagueId === league.id);
    const season = currentSeasonFor(seasons, league.id, league.currentSeasonId);
    return resolveLeagueStandings({
      stored: leagueData.standings,
      seasonId: season?.id,
      teams: lTeams,
      matches: matches.filter((m) => m.leagueId === league.id),
      scoring: season ? scoringForSeason(season, league.sport) : undefined,
      matchLoadLimit: LEAGUE_RECORD_LIMIT,
    });
  }, [league, teams, matches, seasons, leagueData.standings]);

  const sportOf = useMemo(() => (id: string) => teamById.get(id)?.sport as string | undefined, [teamById]);
  const officialRecord = standings.rows.find((row) => row.teamId === teamId);

  if (loading) return <div className="space-y-4"><Skeleton className="h-36 w-full rounded-[var(--radius-xl)]" /><Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" /></div>;
  if (exact.error) return <ErrorState description="This team could not be loaded. Check your connection and try again." onRetry={exact.retry} />;
  if (!team) return <EmptyState icon={Warning} title="Team not found" description="This team may have been removed, or the link is out of date." />;

  return (
    <div className="min-w-0 space-y-5">
      <IdentityHero
        gradient={clubColor(team.name).gradient}
        media={<Crest name={team.name} sport={String(team.sport)} size={72} className="!bg-white/15 !border-white/40 !text-white" />}
        watermark={<span className="font-display font-black text-white">{team.name.slice(0, 3).toUpperCase()}</span>}
        eyebrow={league ? (
          <Link
            href={`/leagues/${encodeURIComponent(league.id)}`}
            className="underline decoration-white/40 underline-offset-4 transition hover:decoration-white"
          >
            {league.name}
          </Link>
        ) : undefined}
        title={team.name}
        verified={team.verified}
        action={<FollowButton targetType="team" targetId={team.id} label="Follow" />}
        meta={
          <>
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {team.city}</span>
            <span className="opacity-50">|</span>
            {/*
              `0-0-0` is a record. A club with no official results does not have one, and
              printing zeros claims it played and drew nothing — which is why this and the
              Club card below must fall back the same way rather than to two different sources.
            */}
            <span className="tabular tabular-nums">{officialRecord ? `${officialRecord.wins}-${officialRecord.draws}-${officialRecord.losses}` : 'No record yet'}</span>
          </>
        }
      />

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {/*
            An empty state rather than nothing. A club between seasons, or one whose league has
            not published its next fixtures, rendered no next-match card at all — so the page
            skipped straight from the banner to the results and read as though the section had
            failed to load. Saying there is no fixture is a fact; showing nothing is a gap.
          */}
          {nextMatch ? (
            <NextMatchCard match={nextMatch} home={teamById.get(nextMatch.homeTeamId)} away={teamById.get(nextMatch.awayTeamId)} />
          ) : (
            <Card className="p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">
                <CalendarBlank className="h-3.5 w-3.5" weight="bold" /> Next fixture
              </p>
              <p className="mt-1.5 text-sm font-semibold text-text-strong">No fixture scheduled.</p>
              <p className="mt-0.5 text-sm leading-6 text-muted">
                {league
                  ? <>Fixtures appear here once {league.name} publishes them.</>
                  : 'Fixtures appear here once the competition publishes them.'}
              </p>
              {league ? (
                <Link
                  href={`/leagues/${encodeURIComponent(league.id)}`}
                  className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
                >
                  See the competition
                </Link>
              ) : null}
            </Card>
          )}

          {results.length ? (
            <section className="space-y-2.5">
              <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-text-strong"><CalendarBlank className="h-4 w-4 text-brand" weight="bold" /> Recent results</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {results.map((m) => <MatchCard key={m.id} match={m} home={teamById.get(m.homeTeamId)} away={teamById.get(m.awayTeamId)} href={`/matches/${m.id}`} />)}
              </div>
            </section>
          ) : null}

          {pendingResults.length ? (
            <section className="space-y-2.5">
              <h2 className="text-[15px] font-semibold text-text-strong">Awaiting verification</h2>
              <p className="text-xs text-muted">Played scores stay separate until the result workflow finalizes them.</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {pendingResults.map((m) => <MatchCard key={m.id} match={m} home={teamById.get(m.homeTeamId)} away={teamById.get(m.awayTeamId)} href={`/matches/${m.id}`} />)}
              </div>
            </section>
          ) : null}

          <SquadGrid athletes={roster} />

          <NewsRow title="From the club" posts={news} badge={<Crest name={team.name} sport={String(team.sport)} size={22} />} />
          {newsData.error ? (
            <Card className="p-4 text-sm text-muted">
              Team updates are temporarily unavailable. The verified team record is still shown.
            </Card>
          ) : null}

          <Card className="p-4 md:p-5">
            <h2 className="text-[15px] font-semibold text-text-strong">Our story</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{team.description}</p>
            <p className="mt-3 flex items-center gap-2 text-sm text-muted"><MapPin className="h-4 w-4 text-brand" /> {team.location ?? team.city}</p>
          </Card>

          <Card className="p-4 md:p-5">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-strong"><Heart className="h-4 w-4 text-brand-2" weight="fill" /> Development needs</h2>
              <div className="mt-3 space-y-3">
                {needs.map((need) => (
                  <div key={need.id}>
                    <div className="flex justify-between gap-3 text-sm"><span className="font-semibold text-text-strong">{need.title}</span><span className="text-brand-2">UGX {need.raisedAmount.toLocaleString()} / {need.targetAmount.toLocaleString()}</span></div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-brand" style={{ width: `${Math.min(100, need.raisedAmount / need.targetAmount * 100)}%` }} /></div>
                    <p className="mt-1 text-xs text-muted">{need.story}</p>
                  </div>
                ))}
                {!needs.length ? <p className="text-sm text-muted">This team is preparing its next verified development update.</p> : null}
              </div>
          </Card>
        </div>

        <aside className="space-y-5">
          {standings.rows.length ? <PositionCallout rows={standings.rows} teamId={team.id} sportById={sportOf} href={league ? `/leagues/${league.id}` : '/leagues'} /> : null}

          <Card className="p-4">
            <h2 className="mb-3 text-[15px] font-semibold text-text-strong">Club</h2>
            <div className="space-y-3">
              {/*
                From the standings projection, and from nothing else.
                
                The comment here used to say "never the stored team.leaguePoints" while the
                code fell back to exactly that with `?? team.leaguePoints`. The intent was
                right and the `??` defeated it: when a club has no projection row, the banner
                above falls back to `0-0-0` and this fell back to the seeded aggregate, so one
                screen showed a club with no record AND six league points. Reported from the
                live demo, on Mbarara Warriors.
                
                That aggregate derives from no match and is maintained by nothing, which is why
                `data:guard` exists to stop new reads of it. A club with no official results has
                no points — saying so is the honest answer, and it agrees with the banner.
              */}
              <InfoRow
                icon={Trophy}
                label="League points"
                value={officialRecord ? String(officialRecord.points) : 'No official results yet'}
                accent="text-brand"
              />
              <InfoRow icon={Users} label="Supporters" value={String(team.supportersCount)} />
              <InfoRow icon={Coins} label="Support raised" value={ugx(team.totalSupport)} accent="text-[var(--brand-2)]" />
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-strong"><Handshake className="h-4 w-4 text-brand-2" /> Partners</h2>
            <div className="mt-3 space-y-2">
              {partners.map((partner) => <div key={partner.id} className="rounded-[var(--radius-md)] bg-surface-2 p-3"><p className="text-sm font-semibold text-text-strong">{partner.name}</p><p className="text-xs text-muted">{partner.impactSummary}</p></div>)}
              {!partners.length ? <p className="text-sm text-muted">No active team partner is listed.</p> : null}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, accent = 'text-text-strong' }: { icon: typeof Trophy; label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-sm text-muted"><Icon className="h-4 w-4" weight="bold" /> {label}</span>
      <span data-numeric className={`text-sm font-bold tabular-nums ${accent}`}>{value}</span>
    </div>
  );
}
