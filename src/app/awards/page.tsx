'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Award, Medal, ShieldCheck, Star, Trophy, Users } from 'lucide-react';
import { awardCategories, mockAthletes, mockCurrentUser, mockTeams } from '@/lib/mockData';
import { formatUGX } from '@/lib/sportThemes';
import { Button } from '@/components/ui/button';
import { GoalPlacePointsBadge, ImpactStatCard, PageContainer, SectionHeader, SportBadge, TrustNote } from '@/components/ui/product';

export default function AwardsPage() {
  const router = useRouter();
  const leaders = [
    { name: 'Ben O.', label: 'Top Contributor', points: mockCurrentUser.points },
    { name: 'Mariam K.', label: 'Most Active Fan', points: 7920 },
    { name: 'Coach Ivan', label: 'Community Champion', points: 7110 },
  ];

  return (
    <PageContainer compact>
      <section className="glass-panel relative overflow-hidden rounded-xl p-5 md:p-10">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--goal-gold)]/18 via-transparent to-[var(--goal-emerald)]/16" />
        <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_0.85fr] lg:items-center">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-xl border border-[var(--goal-gold)]/30 bg-[var(--goal-gold)]/12 text-[var(--goal-gold)]">
                <Award className="size-7" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--goal-gold)]">Annual Recognition</span>
            </div>
            <h1 className="font-heading text-4xl font-black tracking-tight text-white md:text-6xl">GoalPlace Annual Awards</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
              Celebrate the fans, athletes, teams, leagues, youth programs, and women and youth sport impact building Uganda grassroots sport.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button variant="gold" onClick={() => router.push('/register?role=fan')}>Join Awards Race</Button>
              <Button variant="outline" onClick={() => router.push('/feed')}>See Updates</Button>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/24 p-5">
            <GoalPlacePointsBadge points={mockCurrentUser.points} className="mb-5" />
            <p className="text-sm leading-6 text-slate-300">
              GoalPlace Points are loyalty and recognition points, not cash. They help fans qualify for platform recognition and Annual Awards activity.
            </p>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-[var(--goal-emerald)] to-[var(--goal-gold)]" />
            </div>
            <p className="mt-2 text-xs font-bold text-slate-400">72% toward Community Champion finalist tier</p>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-3 md:grid-cols-4">
        <ImpactStatCard label="Award categories" value={String(awardCategories.length)} icon={Medal} />
        <ImpactStatCard label="Fan finalists" value="120" icon={Users} tone="gold" />
        <ImpactStatCard label="Athlete races" value={String(mockAthletes.length)} icon={Trophy} tone="blue" />
        <ImpactStatCard label="Verified moments" value="426" icon={ShieldCheck} tone="orange" />
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <SectionHeader eyebrow="Fan Progress" title="Leaderboard" />
          <div className="space-y-3">
            {leaders.map((leader, index) => (
              <div key={leader.name} className="glass-panel flex items-center gap-4 rounded-xl p-4">
                <div className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/8 font-heading text-lg font-black text-[var(--goal-gold)]">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-heading text-lg font-black text-white">{leader.name}</p>
                  <p className="text-xs text-slate-400">{leader.label}</p>
                </div>
                <p className="font-heading text-lg font-black text-[var(--goal-gold)]">{leader.points.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionHeader eyebrow="Categories" title="Award categories" />
          <div className="grid gap-3 sm:grid-cols-2">
            {awardCategories.map((category) => (
              <div key={category} className="glass-panel rounded-xl p-4">
                <Star className="mb-3 size-5 text-[var(--goal-gold)]" />
                <h3 className="font-heading text-base font-black text-white">{category}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <SectionHeader eyebrow="Athlete Races" title="Athlete award races" />
        <div className="grid gap-4 md:grid-cols-3">
          {mockAthletes.slice(0, 6).map((athlete, index) => (
            <div key={athlete.id} className="glass-panel rounded-xl p-4">
              <div className="mb-4 flex items-center justify-between">
                <SportBadge sport={athlete.sport} />
                <span className="text-xs font-black text-[var(--goal-gold)]">#{index + 1}</span>
              </div>
              <h3 className="font-heading text-lg font-black text-white">{athlete.name}</h3>
              <p className="mt-1 text-sm text-slate-400">{athlete.position}</p>
              <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Verified Support</p>
                <p className="mt-1 font-heading text-lg font-black text-white">{formatUGX(athlete.totalEarnings)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <SectionHeader eyebrow="Team & League Awards" title="Team and league recognition" />
        <div className="grid gap-4 md:grid-cols-3">
          {mockTeams.slice(0, 6).map((team) => (
            <div key={team.id} className="glass-panel rounded-xl p-4">
              <SportBadge sport={team.sport} />
              <h3 className="mt-4 font-heading text-lg font-black text-white">{team.name}</h3>
              <p className="mt-1 text-sm text-slate-400">{team.location}</p>
              <p className="mt-4 text-sm font-black text-[var(--goal-mint)]">{formatUGX(team.supportPool)} support pool</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <TrustNote
          items={[
            'No fan cash winnings.',
            'GoalPlace Points are loyalty and recognition points, not cash.',
            'Achievements are confirmed by league admins or officials.',
            'GoalPlace256 is built for athlete support, not games of chance.',
          ]}
        />
      </section>
    </PageContainer>
  );
}
