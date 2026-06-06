'use client';

import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ClipboardCheck, ShieldCheck, Trophy, Users } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { Button } from '@/components/ui/button';
import {
  GoalPlaceIndexPanel,
  LeagueIntegrityNote,
  LeagueStandingsTable,
  LeagueStatusBadge,
  LeagueStatusRoadmap,
} from '@/components/ui/league';
import { ImpactStatCard, PageContainer, SectionHeader, SportBadge } from '@/components/ui/product';
import { dataProvider } from '@/data/dataProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { buildLeagueStandings } from '@/lib/leagueModel';
import { Match, VerificationStatus } from '@/types';

function normalizeVerificationStatus(status: VerificationStatus): VerificationStatus {
  if (status === 'Verified') return 'verified';
  if (status === 'Rejected') return 'rejected';
  if (status === 'Disputed') return 'disputed';
  return status;
}

export default function LeagueAdminPage() {
  return (
    <RoleGuard allowedRoles={['league_admin', 'platform_admin', 'super_admin']}>
      <LeagueAdminDashboard />
    </RoleGuard>
  );
}

function LeagueAdminDashboard() {
  const { leagues, teams, athletes, matches, challenges } = useGoalPlaceData();
  const [selectedLeagueId, setSelectedLeagueId] = useState(leagues[0]?.id ?? '');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const selectedLeague = leagues.find((league) => league.id === selectedLeagueId) ?? leagues[0];

  const leagueTeams = useMemo(
    () => teams.filter((team) => team.leagueId === selectedLeague?.id),
    [selectedLeague?.id, teams]
  );
  const leagueAthletes = useMemo(
    () => athletes.filter((athlete) => athlete.leagueId === selectedLeague?.id),
    [athletes, selectedLeague?.id]
  );
  const leagueMatches = useMemo(
    () => matches.filter((match) => match.leagueId === selectedLeague?.id),
    [matches, selectedLeague?.id]
  );
  const leagueChallenges = useMemo(
    () => challenges.filter((challenge) => challenge.leagueId === selectedLeague?.id),
    [challenges, selectedLeague?.id]
  );
  const standings = useMemo(() => buildLeagueStandings(leagueTeams, leagueMatches), [leagueMatches, leagueTeams]);

  const updateMatch = async (match: Match, status: VerificationStatus) => {
    setPendingId(match.id);
    try {
      await dataProvider.updateMatchVerification(match.id, normalizeVerificationStatus(status));
      toast.success(`Match marked ${status.toString().toLowerCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Verification update failed');
    } finally {
      setPendingId(null);
    }
  };

  const updateChallenge = async (challengeId: string, status: VerificationStatus) => {
    setPendingId(challengeId);
    try {
      await dataProvider.updateChallengeVerification(challengeId, normalizeVerificationStatus(status));
      toast.success(`Challenge marked ${status.toString().toLowerCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Challenge update failed');
    } finally {
      setPendingId(null);
    }
  };

  if (!selectedLeague) {
    return (
      <PageContainer compact>
        <div className="glass-panel rounded-xl p-8 text-center text-slate-300">No leagues found.</div>
      </PageContainer>
    );
  }

  const pendingMatches = leagueMatches.filter(
    (match) => match.verificationStatus === 'Pending' || match.verificationStatus === 'pending' || match.verificationStatus === 'disputed'
  );
  const pendingChallenges = leagueChallenges.filter(
    (challenge) => challenge.verificationStatus === 'Pending' || challenge.verificationStatus === 'pending' || challenge.verificationStatus === 'disputed'
  );

  return (
    <PageContainer compact>
      <section className="glass-panel rounded-xl p-5 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <SportBadge sport={selectedLeague.sport} />
              <LeagueStatusBadge status={selectedLeague.status} />
            </div>
            <h1 className="font-heading text-4xl font-black text-white md:text-5xl">League Admin Dashboard</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              Create and operate leagues through Draft, Community, Verified, Partner, or Suspended status while keeping sporting results separate from platform quality.
            </p>
          </div>
          <label className="grid min-w-64 gap-2">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">League</span>
            <select
              value={selectedLeague.id}
              onChange={(event) => setSelectedLeagueId(event.target.value)}
              className="h-11 rounded-lg border border-white/10 bg-white/6 px-3 text-sm font-bold text-white outline-none"
            >
              {leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="mt-8 grid gap-3 md:grid-cols-4">
        <ImpactStatCard label="Teams" value={String(leagueTeams.length)} icon={Users} />
        <ImpactStatCard label="Athletes" value={String(leagueAthletes.length)} icon={Trophy} tone="gold" />
        <ImpactStatCard label="Pending matches" value={String(pendingMatches.length)} icon={ClipboardCheck} tone="blue" />
        <ImpactStatCard label="GoalPlace Index" value={String(selectedLeague.goalPlaceIndex)} icon={ShieldCheck} tone="orange" />
      </section>

      <section className="mt-8">
        <SectionHeader eyebrow="League Onboarding" title="Verification model" />
        <LeagueStatusRoadmap activeStatus={selectedLeague.status} />
      </section>

      <section className="mt-8 grid gap-8 xl:grid-cols-[1.08fr_0.92fr]">
        <div>
          <SectionHeader
            eyebrow="League Standings"
            title="Match-result table"
            description="League standings are based only on match results. Paid tools never affect sporting rankings."
          />
          <LeagueStandingsTable standings={standings} />
          <LeagueIntegrityNote className="mt-4" />
        </div>
        <GoalPlaceIndexPanel league={selectedLeague} />
      </section>

      <section className="mt-8 grid gap-8 xl:grid-cols-2">
        <div>
          <SectionHeader eyebrow="Verification" title="Match review queue" />
          <div className="space-y-3">
            {pendingMatches.slice(0, 8).map((match) => (
              <div key={match.id} className="glass-panel rounded-xl p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-heading text-lg font-black text-white">{match.venue}</p>
                    <p className="mt-1 text-sm text-slate-400">{match.city} - {match.status}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateMatch(match, 'verified')} disabled={pendingId === match.id}>
                      <CheckCircle2 className="size-4" />
                      Verify
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => updateMatch(match, 'disputed')} disabled={pendingId === match.id}>
                      Dispute
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {!pendingMatches.length && (
              <div className="glass-panel rounded-xl p-5 text-sm text-slate-300">No match reviews pending.</div>
            )}
          </div>
        </div>

        <div>
          <SectionHeader eyebrow="Challenges" title="Performance review queue" />
          <div className="space-y-3">
            {pendingChallenges.slice(0, 8).map((challenge) => (
              <div key={challenge.id} className="glass-panel rounded-xl p-4">
                <p className="font-heading text-lg font-black text-white">{challenge.targetDescription ?? challenge.description}</p>
                <p className="mt-1 text-sm text-slate-400">{challenge.status} - {challenge.verificationStatus}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => updateChallenge(challenge.id, 'verified')} disabled={pendingId === challenge.id}>
                    Verify
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updateChallenge(challenge.id, 'rejected')} disabled={pendingId === challenge.id}>
                    Reject
                  </Button>
                </div>
              </div>
            ))}
            {!pendingChallenges.length && (
              <div className="glass-panel rounded-xl p-5 text-sm text-slate-300">No challenge reviews pending.</div>
            )}
          </div>
        </div>
      </section>
    </PageContainer>
  );
}
