'use client';

import { useEffect, useMemo, useState } from 'react';
import { Coins, ShieldCheck, Users, SealCheck, Broadcast } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { isOfficialMatch } from '@/lib/status';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { DemoDataNote } from '@/components/ui/DemoDataNote';
import { AthleteCard } from '@/components/core/EntityCards';
import { useAuth } from '@/context/AuthProvider';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import type { Allocation } from '@/types/money';

function ugx(n: number): string {
  if (n >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `UGX ${(n / 1_000).toFixed(0)}k`;
  return `UGX ${n}`;
}

/**
 * Sponsor impact and proof. No competition controls. Everything shown is backed by verified
 * activity, which is the entire reason a sponsor can trust the reach numbers.
 */
export function SponsorReport() {
  const { isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const { teams, athletes, matches, sponsors, sponsorCampaigns, sponsorReports, loading } = useGoalPlaceData({
    collections: ['teams', 'athletes', 'matches', 'sponsors', 'sponsorCampaigns', 'sponsorReports'],
  });
  const [campaignId, setCampaignId] = useState('');
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  useEffect(() => {
    provider.getAllocations().then(setAllocations).catch(() => setAllocations([]));
  }, [provider]);
  const selectedCampaignId = campaignId || sponsorCampaigns[0]?.id || '';

  const data = useMemo(() => {
    const campaign = sponsorCampaigns.find((item) => item.id === selectedCampaignId) ?? sponsorCampaigns[0];
    const leagueIds = new Set(campaign?.supportedLeagueIds ?? []);
    const campaignTeams = teams.filter((team) => leagueIds.has(team.leagueId) || campaign?.supportedTeamIds.includes(team.id));
    const teamIds = new Set(campaignTeams.map((team) => team.id));
    const campaignAthletes = athletes.filter((athlete) =>
      leagueIds.has(athlete.leagueId)
      || teamIds.has(athlete.teamId)
      || campaign?.supportedAthleteIds.includes(athlete.id),
    );
    const campaignMatches = matches.filter((match) => leagueIds.has(match.leagueId));
    const played = campaignMatches.filter((match) => match.status === 'completed');
    const official = campaignMatches.filter(isOfficialMatch).length;
    const paidAllocations = allocations.filter((allocation) =>
      allocation.status === 'paid' && allocation.campaignId === campaign?.id,
    );
    const support = paidAllocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0);
    const report = sponsorReports.find((item) => item.campaignId === campaign?.id);
    const sponsor = sponsors.find((item) => item.id === campaign?.sponsorId);
    const topAthletes = [...campaignAthletes].filter((athlete) => athlete.verified)
      .sort((left, right) => (right.totalSupport ?? 0) - (left.totalSupport ?? 0))
      .slice(0, 4);
    return {
      campaign,
      sponsor,
      official,
      rate: played.length ? Math.round((official / played.length) * 100) : 0,
      support,
      supporters: report?.fanProfiles ?? 0,
      evidenceItems: report?.evidenceItems ?? campaign?.evidenceUrls.length ?? 0,
      topAthletes,
    };
  }, [allocations, athletes, matches, selectedCampaignId, sponsorCampaigns, sponsorReports, sponsors, teams]);

  if (loading) return <div className="space-y-3"><Skeleton className="h-8 w-40" /><Skeleton className="h-48 w-full rounded-[var(--radius-lg)]" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text-strong">Sponsor proof packet</h1>
        <p className="text-sm text-muted">Campaign-specific proof from official matches, paid allocations, and recorded evidence.</p>
      </div>

      <DemoDataNote />

      <label className="block text-xs font-semibold uppercase text-subtle">
        Campaign
        <select className="field mt-2 normal-case" value={data.campaign?.id ?? ''} onChange={(event) => setCampaignId(event.target.value)}>
          {sponsorCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
        </select>
      </label>

      {data.campaign ? (
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-brand">{data.sponsor?.name ?? 'Sponsor programme'}</p>
          <h2 className="mt-1 text-lg font-semibold text-text-strong">{data.campaign.name}</h2>
          <p className="mt-1 text-sm text-muted">{data.campaign.objective}</p>
          <p className="mt-3 text-xs text-subtle">Restricted budget {ugx(data.campaign.budgetUGX)} / {data.evidenceItems} evidence items</p>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5">
        <Big icon={Coins} label="Paid allocations" value={ugx(data.support)} accent="text-[var(--brand-2)]" />
        <Big icon={Users} label="Supporters reached" value={String(data.supporters)} />
        <Big icon={ShieldCheck} label="Verified results" value={`${data.rate}%`} accent="text-[var(--state-verified)]" />
        <Big icon={Broadcast} label="Official matches" value={String(data.official)} />
      </div>

      <Card className="p-4">
        <p className="text-sm font-semibold text-text-strong">Why this is trustworthy</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Match figures include only official results. Financial impact includes only paid
          allocations explicitly attributed to this campaign; unrelated activity is excluded.
        </p>
      </Card>

      <section className="space-y-2.5">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-text-strong">
          <SealCheck className="h-4 w-4 text-[var(--state-verified)]" weight="fill" /> Verified athletes to feature
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {data.topAthletes.map((a) => <AthleteCard key={a.id} athlete={a} />)}
        </div>
      </section>
    </div>
  );
}

function Big({ icon: Icon, label, value, accent = 'text-text-strong' }: { icon: typeof Coins; label: string; value: string; accent?: string }) {
  return (
    <Card className="p-4">
      <span className="mb-2 inline-grid h-9 w-9 place-items-center rounded-full bg-surface-3 text-muted"><Icon className="h-5 w-5" weight="bold" /></span>
      <p data-numeric className={`tabular text-xl font-bold tabular-nums ${accent}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</p>
    </Card>
  );
}
