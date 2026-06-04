'use client';

import React, { useSyncExternalStore } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, Clock, FileCheck2, ShieldAlert, Trophy, Users } from 'lucide-react';
import { dashboardSeries, mockAthletes, mockChallenges, mockLeagues, mockMatches, mockTeams } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { ImpactStatCard, PageContainer, SectionHeader, SportBadge } from '@/components/ui/product';

export default function LeagueAdminPage() {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const league = mockLeagues[0];
  const fixtures = mockMatches.filter((match) => match.leagueId === league.id);
  const athletes = mockAthletes.filter((athlete) => athlete.leagueId === league.id);

  return (
    <PageContainer compact>
      <SectionHeader
        eyebrow="League Admin"
        title={`${league.name} operations`}
        description="Manage verification, fixtures, results, athlete approvals, payout reviews, analytics, and moderation queues."
        action={<SportBadge sport={league.sport} />}
      />

      <div className="grid gap-3 md:grid-cols-4">
        <ImpactStatCard label="Pending verifications" value="8" icon={Clock} />
        <ImpactStatCard label="Fixtures" value={String(fixtures.length)} icon={Trophy} tone="gold" />
        <ImpactStatCard label="Athletes" value={String(athletes.length)} icon={Users} tone="blue" />
        <ImpactStatCard label="Completion" value={`${league.completionRate}%`} icon={CheckCircle2} tone="orange" />
      </div>

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
                  const teamA = mockTeams.find((team) => team.id === match.teamAId);
                  const teamB = mockTeams.find((team) => team.id === match.teamBId);
                  return (
                    <tr key={match.id}>
                      <td className="px-4 py-4 font-bold text-white">{teamA?.name} vs {teamB?.name}</td>
                      <td className="px-4 py-4 text-slate-300">{match.venue}</td>
                      <td className="px-4 py-4 text-slate-300">{match.status}</td>
                      <td className="px-4 py-4 text-slate-300">{match.verificationStatus}</td>
                      <td className="px-4 py-4"><Button size="sm" variant="outline">Review</Button></td>
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
        <QueueCard icon={CheckCircle2} title="Payout review queue" items={mockChallenges.slice(0, 3).map((challenge) => challenge.targetDescription)} />
        <QueueCard icon={Trophy} title="League operations" items={['Publish weekend schedule', 'Confirm officials list', 'Export verified results']} />
      </section>
    </PageContainer>
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
