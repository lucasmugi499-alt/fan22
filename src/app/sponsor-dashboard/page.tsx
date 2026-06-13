'use client';

import React, { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CheckmarkCircle01Icon,
  ChartLineData01Icon,
  ZapIcon,
  UserGroupIcon,
  ListViewIcon,
  Download01Icon,
  LockKeyIcon,
  ArrowLeft01Icon,
} from 'hugeicons-react';
import { Trophy, Users } from '@phosphor-icons/react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { Button } from '@/components/ui/button';
import {
  AppPageHeader,
  DashboardSection,
  DashboardStatGrid,
  DataCard,
  MobileDataCard,
  PageContainer,
  SectionHeader,
  StatusBadge,
  TabStrip,
  ActionToolbar,
} from '@/components/ui/product';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { formatUGX } from '@/lib/sportThemes';
import { sponsorPackages } from '@/data/sponsorPackages';
import { toast } from 'sonner';
import { SponsorReportModal } from '@/components/modals/demo-modals';
import { useAuth } from '@/context/AuthProvider';

function MiniMeta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-200">{value}</p>
    </div>
  );
}

export default function SponsorDashboardPage() {
  return (
    <RoleGuard allowedRoles={['sponsor', 'platform_admin', 'super_admin']}>
      <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading sponsor dashboard...</div>}>
        <SponsorDashboard />
      </Suspense>
    </RoleGuard>
  );
}

function SponsorDashboard() {
  const searchParams = useSearchParams();
  const { role } = useAuth();
  const tabs = useMemo(() => ['Overview', 'Supported Entities', 'Impact Feed', 'Brand Visibility', 'Monthly Report', 'Packages', 'Account'], []);
  const routeTab = searchParams?.get('tab');
  const routeKey = searchParams?.toString() ?? '';
  const [localTab, setLocalTab] = useState<{ routeKey: string; tab: string | null }>({ routeKey, tab: null });
  const activeTab = localTab.routeKey === routeKey && localTab.tab
    ? localTab.tab
    : routeTab && tabs.includes(routeTab)
      ? routeTab
      : 'Overview';
  const setActiveTab = (tab: string) => setLocalTab({ routeKey, tab });
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const { athletes, teams, leagues, feedPosts } = useGoalPlaceData();

  const needsFunded = [
    { title: 'Training Equipment', amount: 450000, athletes: 12 },
    { title: 'Matchday Transport', amount: 250000, athletes: 8 },
    { title: 'Footwear & Gear', amount: 800000, athletes: 5 },
    { title: 'Medical & Recovery', amount: 300000, athletes: 3 },
  ];

  const sponsoredAthletes = athletes.slice(0, 3);
  const sponsoredTeams = teams.slice(0, 2);
  const sponsoredLeagues = leagues.slice(0, 1);

  const sponsorPosts = feedPosts.slice(0, 3);
  const isAdminPreview = role === 'platform_admin' || role === 'super_admin';
  const impactTimeline = [
    { date: 'Sep 04, 2026', item: 'Matchday transport', beneficiary: sponsoredTeams[0]?.name ?? 'Kampala Youth League', amount: 250000, evidence: 'Receipts and team admin confirmation', status: 'Approved' },
    { date: 'Sep 11, 2026', item: 'Boots and gear', beneficiary: sponsoredAthletes[0]?.name ?? 'Verified athletes', amount: 800000, evidence: 'Athlete pickup photos', status: 'Evidence attached' },
    { date: 'Sep 18, 2026', item: 'Training equipment', beneficiary: sponsoredLeagues[0]?.name ?? 'Partner league', amount: 450000, evidence: 'League inventory note', status: 'Pending review' },
  ];
  const evidenceCards = [
    ['Payment allocation', `${formatUGX(3200000)} allocated to verified needs`],
    ['Beneficiary proof', '45 athletes linked to team or league records'],
    ['Sporting independence', 'Sponsor support is tracked separately from results and rankings'],
  ];

  const handleDemoAction = (message: string) => {
    toast.success(message);
  };

  return (
    <PageContainer compact className="space-y-6">
      {isAdminPreview && (
        <Link href="/admin?tab=Sponsors" className="mb-2 inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/7 px-3 py-2 text-sm font-bold text-white">
          <ArrowLeft01Icon className="size-4" />
          Back to Sponsor Package Queue
        </Link>
      )}
      <AppPageHeader
        eyebrow="Sponsor impact reporting"
        title="Sponsor Impact Dashboard"
        description="Track where your support goes, who it helps, and how your brand is showing up in grassroots sport."
        meta={
          <>
            <StatusBadge tone="gold">Partner Tier: League Builder</StatusBadge>
            <StatusBadge tone="info">Impact reports enabled</StatusBadge>
          </>
        }
        actions={
          <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-right">
            <p className="text-xs font-bold text-[var(--goal-gold)]">
              Demo sponsor reporting only.
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Real payment processing is not enabled.
            </p>
          </div>
        }
      />

      <TabStrip tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <ActionToolbar>
        <Button size="sm" onClick={() => setReportModalOpen(true)}>
          <Download01Icon className="size-4" /> <span className="hidden sm:inline">Download Monthly Impact Report</span><span className="sm:hidden">Download Report</span>
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleDemoAction('Opening campaign overview in demo mode...')}>
          <ChartLineData01Icon className="size-4" /> View Campaign
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleDemoAction('Opening sponsor note modal in demo mode...')}>
          <ListViewIcon className="size-4" /> Add Sponsor Note
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleDemoAction('Renew or Upgrade Package modal opened')}>
          <ZapIcon className="size-4" /> <span className="hidden sm:inline">Renew or Upgrade Package</span><span className="sm:hidden">Package</span>
        </Button>
      </ActionToolbar>

      <div className="mt-8 rounded-xl border border-[var(--goal-gold)]/20 bg-[var(--goal-gold)]/5 p-4 text-sm text-[var(--goal-gold)]">
        <div className="flex items-start gap-3">
          <LockKeyIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong>Demo payout reviews only.</strong> Real payment processing is not enabled. Sponsor support is tracked separately and never affects match results, rankings, or athlete verification.
          </p>
        </div>
      </div>

      {activeTab === 'Overview' && (
        <div className="space-y-8">
          <DashboardStatGrid>
            <div className="glass-panel rounded-xl p-4">
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-[var(--goal-gold)]/25 bg-[var(--goal-gold)]/10 text-[var(--goal-gold)]">
                <Trophy className="size-5" />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Total Committed</p>
              <p className="mt-1 font-display text-2xl font-black text-white">{formatUGX(5000000)}</p>
              <p className="mt-2 text-sm leading-5 text-slate-300">{formatUGX(3200000)} allocated</p>
            </div>
            <div className="glass-panel rounded-xl p-4">
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-[var(--goal-emerald)]/25 bg-[var(--goal-emerald)]/10 text-[var(--goal-mint)]">
                <Users className="size-5" />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Direct Impact</p>
              <p className="mt-1 font-display text-2xl font-black text-white">45 Athletes</p>
              <p className="mt-2 text-sm leading-5 text-slate-300">Across 6 teams</p>
            </div>
            <div className="glass-panel rounded-xl p-4">
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-blue-400/25 bg-blue-500/10 text-blue-300">
                <UserGroupIcon className="size-5" />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Est. Community Reach</p>
              <p className="mt-1 font-display text-2xl font-black text-white">12,500+</p>
              <p className="mt-2 text-sm leading-5 text-slate-300">Fans and supporters</p>
            </div>
            <div className="glass-panel rounded-xl p-4">
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-purple-400/25 bg-purple-500/10 text-purple-300">
                <ChartLineData01Icon className="size-5" />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Media Generated</p>
              <p className="mt-1 font-display text-2xl font-black text-white">24 Posts</p>
              <p className="mt-2 text-sm leading-5 text-slate-300">3,200 engagements</p>
            </div>
          </DashboardStatGrid>

          <DashboardSection eyebrow="Impact Needs" title="What Your Support Funded">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {needsFunded.map((need) => (
                <DataCard key={need.title}>
                  <ZapIcon className="mb-4 size-6 text-[var(--goal-gold)]" />
                  <h3 className="font-display text-lg font-black text-white">{need.title}</h3>
                  <p className="mt-2 text-sm font-bold text-[var(--goal-mint)]">{formatUGX(need.amount)}</p>
                  <p className="mt-1 text-sm text-slate-400">{need.athletes} athletes impacted</p>
                </DataCard>
              ))}
            </div>
          </DashboardSection>

          <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
            <DashboardSection eyebrow="Impact Timeline" title="Evidence-backed funding timeline">
              <div className="space-y-3">
                {impactTimeline.map((item) => (
                  <MobileDataCard
                    key={`${item.date}-${item.item}`}
                    title={item.item}
                    eyebrow={`${item.date} • ${item.beneficiary}`}
                    meta={<StatusBadge tone={item.status === 'Approved' ? 'success' : item.status === 'Pending review' ? 'warning' : 'info'}>{item.status}</StatusBadge>}
                  >
                    <div className="grid gap-3 sm:grid-cols-3">
                      <MiniMeta label="Amount" value={formatUGX(item.amount)} />
                      <MiniMeta label="Evidence" value={item.evidence} />
                      <MiniMeta label="Next step" value={item.status === 'Pending review' ? 'Review evidence' : 'Included in report'} />
                    </div>
                  </MobileDataCard>
                ))}
              </div>
            </DashboardSection>
            <DashboardSection eyebrow="Proof" title="Evidence summary">
              <div className="grid gap-3">
                {evidenceCards.map(([title, detail]) => (
                  <DataCard key={title}>
                    <CheckmarkCircle01Icon className="mb-3 size-5 text-[var(--goal-mint)]" />
                    <h3 className="font-display text-lg font-black text-white">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{detail}</p>
                  </DataCard>
                ))}
              </div>
            </DashboardSection>
          </div>
        </div>
      )}

      {activeTab === 'Supported Entities' && (
        <div className="space-y-8">
          <DashboardSection eyebrow="Leagues" title="Leagues Supported">
            <div className="grid gap-3">
              {sponsoredLeagues.map((league) => (
                <MobileDataCard key={league.id} title={league.name} eyebrow={league.city} meta={<StatusBadge tone="gold">Title Sponsor</StatusBadge>}>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MiniMeta label="Sport" value={league.sport} />
                    <MiniMeta label="Teams Reached" value={4} />
                    <MiniMeta label="Total Support" value={formatUGX(2000000)} />
                  </div>
                </MobileDataCard>
              ))}
            </div>
          </DashboardSection>
          
          <DashboardSection eyebrow="Teams" title="Teams Supported">
            <div className="grid gap-3 lg:grid-cols-2">
              {sponsoredTeams.map((team) => (
                <MobileDataCard key={team.id} title={team.name} eyebrow={team.city} meta={<StatusBadge tone="success">Operational</StatusBadge>}>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MiniMeta label="Wins" value={team.wins} />
                    <MiniMeta label="Support Provided" value={formatUGX(team.supportPool ?? 0)} />
                  </div>
                </MobileDataCard>
              ))}
            </div>
          </DashboardSection>

          <DashboardSection eyebrow="Athletes" title="Athletes Supported">
            <div className="grid gap-3 lg:grid-cols-3">
              {sponsoredAthletes.map((athlete) => (
                <MobileDataCard key={athlete.id} title={athlete.name} eyebrow={`${athlete.sport} • ${athlete.position}`} meta={<StatusBadge tone="info">Verified</StatusBadge>}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MiniMeta label="Impact Needs" value="Transport, Boots" />
                    <MiniMeta label="Allocated" value={formatUGX(athlete.totalEarnings ?? 0)} />
                  </div>
                </MobileDataCard>
              ))}
            </div>
          </DashboardSection>
        </div>
      )}

      {activeTab === 'Impact Feed' && (
        <DashboardSection eyebrow="Media" title="Your Impact in the Community" description="Verified posts and thank-you notes from the athletes and leagues you sponsor.">
          <div className="grid gap-4 lg:grid-cols-2">
            {sponsorPosts.map((post) => (
              <DataCard key={post.id}>
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-white/10" />
                  <div>
                    <p className="font-bold text-white">{post.authorName}</p>
                    <p className="text-xs text-slate-400">Sponsored Impact Update</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-200">&quot;{post.caption}&quot;</p>
                <div className="mt-4 flex items-center gap-4 text-xs font-bold text-slate-400">
                  <span>{post.likesCount} Likes</span>
                  <span>{post.commentsCount} Comments</span>
                </div>
              </DataCard>
            ))}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Brand Visibility' && (
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <DataCard>
            <SectionHeader eyebrow="Placements" title="Brand Exposure" className="mb-4" />
            <div className="space-y-4 text-sm">
              <MiniMeta label="League Page Impressions" value="14,200" />
              <MiniMeta label="Supported Athlete Profile Views" value="8,400" />
              <MiniMeta label="Feed Impressions" value="32,000" />
              <MiniMeta label="Upcoming Sponsored Matches" value="4 this weekend" />
            </div>
          </DataCard>
          <DataCard className="flex flex-col items-center justify-center text-center">
            <Trophy className="mb-4 size-10 text-[var(--goal-gold)]" />
            <h3 className="font-display text-xl font-black text-white">Award Naming Rights Active</h3>
            <p className="mt-2 max-w-sm text-sm text-slate-300">Your brand will be featured as the primary sponsor for the &quot;Athlete of the Month&quot; award.</p>
          </DataCard>
        </div>
      )}

      {activeTab === 'Monthly Report' && (
        <DashboardSection eyebrow="Reporting" title="Monthly Impact Report Preview" action={<Button variant="gold" onClick={() => handleDemoAction('Monthly report generated.')}><Download01Icon className="size-4" /> Download PDF Report</Button>}>
          <div className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 bg-white/5 p-6 md:p-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-2xl font-black text-white">September 2026 Impact Report</h3>
                  <p className="mt-1 text-sm text-slate-400">Generated for Sponsor Demo</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Total Commitment</p>
                  <p className="mt-1 font-display text-2xl font-black text-[var(--goal-gold)]">{formatUGX(5000000)}</p>
                </div>
              </div>
            </div>
            <div className="grid gap-6 p-6 sm:grid-cols-3 md:p-8">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Total Allocation Used</p>
                <p className="mt-1 font-display text-xl font-black text-white">{formatUGX(3200000)}</p>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Direct Athletes Reached</p>
                <p className="mt-1 font-display text-xl font-black text-white">45</p>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Platform Engagement</p>
                <p className="mt-1 font-display text-xl font-black text-white">3,200 interactions</p>
              </div>
            </div>
            <div className="bg-black/20 p-6 md:p-8">
              <h4 className="font-bold text-white">Summary</h4>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                This month, your support directly funded matchday transport and boots for 45 verified athletes across 6 teams. The sponsored league completed 12 verified fixtures with no reported disputes, generating significant community visibility.
              </p>
            </div>
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Packages' && (
        <DashboardSection eyebrow="Sponsorship" title="Renew or Upgrade Package">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {sponsorPackages.map((pkg) => (
              <div key={pkg.name} className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/5 p-5">
                <div>
                  <h3 className="font-display text-lg font-black text-white">{pkg.name}</h3>
                  <p className="mt-1 font-display text-xl font-black text-[var(--goal-gold)]">{pkg.price}</p>
                  <ul className="mt-4 space-y-2">
                    <li className="flex items-start gap-2 text-sm text-slate-300">
                      <CheckmarkCircle01Icon className="mt-0.5 size-4 shrink-0 text-[var(--goal-mint)]" />
                      <span>{pkg.detail}</span>
                    </li>
                  </ul>
                </div>
                <Button className="mt-6 w-full" variant="outline" onClick={() => handleDemoAction(`${pkg.name} selected. Demo only.`)}>View Sponsor Package</Button>
              </div>
            ))}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Account' && (
        <DashboardSection eyebrow="Account" title="Sponsor account controls" description="Manage reporting contacts, package status, and demo account preferences.">
          <div className="grid gap-4 lg:grid-cols-3">
            {[
              ['Reporting contact', 'impact@demo-sponsor.co', 'Edit reporting email'],
              ['Package status', 'League Builder active', 'View Sponsor Package'],
              ['Demo limitations', 'Real payments disabled', 'Review demo notice'],
            ].map(([title, detail, action]) => (
              <DataCard key={title}>
                <h3 className="font-display text-lg font-black text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{detail}</p>
                <Button className="mt-4" size="sm" variant="outline" onClick={() => handleDemoAction(`${action} opened.`)}>{action}</Button>
              </DataCard>
            ))}
          </div>
        </DashboardSection>
      )}

      <SponsorReportModal open={reportModalOpen} onOpenChange={setReportModalOpen} />
    </PageContainer>
  );
}
