'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, Clock, FileCheck2, Landmark, ShieldAlert, Trophy, Users } from 'lucide-react';
import { toast } from 'sonner';
import { dashboardSeries } from '@/lib/mockData';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { updateVerificationStatus } from '@/lib/firebase/firestore';
import { buildLeagueStandings } from '@/lib/leagueModel';
import { LeagueStatus, SportType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { RoleGuard } from '@/components/auth/RoleGuard';
import {
  GoalPlaceIndexPanel,
  LeagueIntegrityNote,
  LeagueStandingsTable,
  LeagueStatusBadge,
  LeagueStatusRoadmap,
} from '@/components/ui/league';
import { ImpactStatCard, PageContainer, SectionHeader, SportBadge } from '@/components/ui/product';

const formControlClass =
  'h-11 w-full rounded-lg border border-white/10 bg-white/6 px-3 text-sm font-semibold text-white outline-none transition-colors placeholder:text-slate-500 focus:border-[var(--goal-emerald)]/55';

export default function LeagueAdminPage() {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const { currentUser } = useAuth();
  const { athletes: allAthletes, challenges, leagues, matches, teams: allTeams } = useGoalPlaceData();
  const league = leagues[0];
  const fixtures = matches.filter((match) => match.leagueId === league.id);
  const athletes = allAthletes.filter((athlete) => athlete.leagueId === league.id);
  const teams = allTeams.filter((team) => team.leagueId === league.id);
  const standings = buildLeagueStandings(teams, fixtures);
  const [newLeagueName, setNewLeagueName] = useState('Kampala Youth Cup');
  const [newLeagueSport, setNewLeagueSport] = useState<SportType>('Football');
  const [newLeagueStatus, setNewLeagueStatus] = useState<LeagueStatus>('draft');

  const createLeague = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    toast.success(`${newLeagueName || 'New league'} saved as ${newLeagueStatus} in demo mode`);
  };

  const updateMatchVerification = async (matchId: string, verificationStatus: 'Verified' | 'Disputed') => {
    if (!isFirebaseConfigured) {
      toast.success(`Demo ${verificationStatus.toLowerCase()} status recorded locally.`);
      return;
    }

    if (!currentUser) {
      toast.error('Please log in as a league admin.');
      return;
    }

    try {
      await updateVerificationStatus({
        collectionName: 'matches',
        id: matchId,
        verificationStatus,
        verifiedBy: currentUser.uid,
      });
      toast.success(`Match marked ${verificationStatus}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update verification status');
    }
  };

  return (
    <RoleGuard allowedRoles={['league_admin', 'platform_admin', 'super_admin']}>
      <PageContainer compact>
      <SectionHeader
        eyebrow="League Admin"
        title={`${league.name} operations`}
        description="Manage verification, fixtures, results, athlete approvals, payout reviews, analytics, and moderation queues."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SportBadge sport={league.sport} />
            <LeagueStatusBadge status={league.status} />
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-4">
        <ImpactStatCard label="Pending verifications" value="8" icon={Clock} />
        <ImpactStatCard label="Fixtures" value={String(fixtures.length)} icon={Trophy} tone="gold" />
        <ImpactStatCard label="Athletes" value={String(athletes.length)} icon={Users} tone="blue" />
        <ImpactStatCard label="GoalPlace Index" value={String(league.goalPlaceIndex)} icon={CheckCircle2} tone="orange" />
      </div>

      <section className="mt-8">
        <SectionHeader
          eyebrow="Verification Model"
          title="League status ladder"
          description="Status controls publication, verification, reporting, and operational tools. It never changes match results or the sporting table."
        />
        <LeagueStatusRoadmap activeStatus={league.status} />
      </section>

      <section className="mt-8 grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
        <form onSubmit={createLeague} className="glass-panel rounded-xl p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-[var(--goal-emerald)]/25 bg-[var(--goal-emerald)]/10 text-[var(--goal-mint)]">
              <Landmark className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--goal-mint)]">
                League Creation
              </p>
              <h2 className="font-heading text-2xl font-black text-white">Create league draft</h2>
            </div>
          </div>

          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">League name</span>
              <input
                className={formControlClass}
                value={newLeagueName}
                onChange={(event) => setNewLeagueName(event.target.value)}
                placeholder="League name"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Sport</span>
              <select
                className={formControlClass}
                value={newLeagueSport}
                onChange={(event) => setNewLeagueSport(event.target.value as SportType)}
              >
                <option>Football</option>
                <option>Basketball</option>
                <option>Rugby</option>
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Starting status</span>
              <select
                className={formControlClass}
                value={newLeagueStatus}
                onChange={(event) => setNewLeagueStatus(event.target.value as LeagueStatus)}
              >
                <option value="draft">Draft League</option>
                <option value="community">Community League</option>
                <option value="verified">Verified League</option>
                <option value="partner">Partner League</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <SportBadge sport={newLeagueSport} />
                <LeagueStatusBadge status={newLeagueStatus} />
              </div>
              <p className="text-sm leading-6 text-slate-300">
                New leagues should begin as Draft League until the public page, teams, fixtures, admins, and
                verification evidence are ready.
              </p>
            </div>
            <LeagueIntegrityNote />
            <Button size="lg" type="submit">Save League</Button>
          </div>
        </form>

        <div>
          <SectionHeader
            eyebrow="League Standings"
            title="Sporting table"
            description="Only completed match results are used here."
          />
          <LeagueStandingsTable standings={standings} />
        </div>
      </section>

      <section className="mt-8">
        <GoalPlaceIndexPanel league={league} />
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="glass-panel rounded-xl p-5">
          <SectionHeader eyebrow="Analytics" title="League analytics" className="mb-4" />
          <div className="h-72">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboardSeries}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="month" stroke="#94A3B8" tickLine={false} axisLine={false} />
                  <YAxis stroke="#94A3B8" tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#F8FAFC' }} />
                  <Bar dataKey="fans" fill="#F5B942" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full rounded-xl border border-white/10 bg-white/5" />
            )}
          </div>
        </div>
        <div className="grid gap-4">
          <QueueCard icon={FileCheck2} title="Result verification queue" items={['Kisenyi FC 2-1 Makindye Stars', 'Old Kampala roster confirmation', 'Amina clean sheet evidence']} />
          <QueueCard icon={ShieldAlert} title="Moderation queue" items={['Duplicate highlight review', 'Comment flagged by league admin', 'Sponsor post approval']} />
        </div>
      </section>

      <section className="mt-8">
        <SectionHeader eyebrow="Fixture Management" title="Fixture management mock table" />
        <div className="overflow-hidden rounded-xl border border-white/10">
          <div className="hide-scrollbar overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-white/6 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                <tr>
                  <th className="px-4 py-3">Match</th>
                  <th className="px-4 py-3">Venue</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Verification</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8 bg-white/[0.03]">
                {fixtures.map((match) => {
                  const teamA = allTeams.find((team) => team.id === match.teamAId);
                  const teamB = allTeams.find((team) => team.id === match.teamBId);
                  return (
                    <tr key={match.id}>
                      <td className="px-4 py-4 font-bold text-white">{teamA?.name} vs {teamB?.name}</td>
                      <td className="px-4 py-4 text-slate-300">{match.venue}</td>
                      <td className="px-4 py-4 text-slate-300">{match.status}</td>
                      <td className="px-4 py-4 text-slate-300">{match.verificationStatus}</td>
                      <td className="px-4 py-4">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => updateMatchVerification(match.id, 'Verified')}>Verify</Button>
                          <Button size="sm" variant="ghost" onClick={() => updateMatchVerification(match.id, 'Disputed')}>Dispute</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <QueueCard icon={Users} title="Athlete approval queue" items={['Ruth Nansubuga profile update', 'Moses Baluku verification docs', 'Youth academy athlete import']} />
        <QueueCard icon={CheckCircle2} title="Payout review queue" items={challenges.slice(0, 3).map((challenge) => challenge.targetDescription)} />
        <QueueCard icon={Trophy} title="League operations" items={['Publish weekend schedule', 'Confirm officials list', 'Export verified results']} />
      </section>
      </PageContainer>
    </RoleGuard>
  );
}

function QueueCard({
  icon: Icon,
  title,
  items,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: string[];
}) {
  return (
    <div className="glass-panel rounded-xl p-5">
      <Icon className="mb-4 size-6 text-[var(--goal-mint)]" />
      <h3 className="font-heading text-xl font-black text-white">{title}</h3>
      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <div key={item} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm font-semibold text-slate-300">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
