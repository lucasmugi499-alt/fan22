'use client';

import { useMemo } from 'react';
import { SealCheck, PencilSimple, MapPin, Trophy, Coins, Users } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyTeam, teamRecord } from '@/lib/team/teamContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { VerificationBadge } from '@/components/ui/StatusBadge';
import { normalizeVerificationStatus } from '@/lib/status';

function ugx(n: number): string {
  if (n >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `UGX ${(n / 1_000).toFixed(0)}k`;
  return `UGX ${n}`;
}

export function TeamProfile() {
  const { userProfile } = useAuth();
  const { teams, matches, athletes, loading } = useGoalPlaceData();

  const team = useMemo(() => resolveMyTeam(userProfile, teams, matches), [userProfile, teams, matches]);
  const rosterCount = useMemo(
    () => (team ? athletes.filter((a) => a.teamId === team.id).length : 0),
    [team, athletes]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-[var(--radius-lg)]" />
        <Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" />
      </div>
    );
  }
  if (!team) return null;

  const vs = normalizeVerificationStatus(team.verificationStatus ?? (team.verified ? 'verified' : 'pending'));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-strong">Team profile</h1>
        <Button size="sm" variant="secondary" icon={PencilSimple} onClick={() => toast('Editing the team profile arrives in the next build step.')}>
          Edit
        </Button>
      </div>

      {/* Identity */}
      <Card className="p-4">
        <div className="flex items-center gap-3.5">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[var(--radius-lg)] border border-[color:var(--border-glow)] bg-surface-2 text-xl font-bold text-text-strong shadow-[var(--glow-brand)]">
            {team.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-text-strong">{team.name}</h2>
              {team.verified ? <SealCheck className="h-5 w-5 shrink-0 text-[var(--state-verified)]" weight="fill" /> : null}
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
              <MapPin className="h-3.5 w-3.5" /> {team.city}, {team.country}
            </p>
            <div className="mt-2"><VerificationBadge status={vs} size="sm" /></div>
          </div>
        </div>
        {team.description ? <p className="mt-3 text-sm leading-relaxed text-muted">{team.description}</p> : null}
      </Card>

      {/* Season snapshot */}
      <div className="grid grid-cols-2 gap-2.5">
        <Stat icon={Trophy} label="Record" value={teamRecord(team)} accent="text-text-strong" />
        <Stat icon={Trophy} label="League points" value={String(team.leaguePoints)} accent="text-brand" />
        <Stat icon={Users} label="Supporters" value={String(team.supportersCount)} accent="text-text-strong" />
        <Stat icon={Coins} label="Total support" value={ugx(team.totalSupport)} accent="text-[var(--brand-2)]" />
      </div>

      <Card className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold text-text-strong">Roster</p>
          <p className="text-xs text-muted"><span className="tabular tabular-nums">{rosterCount}</span> registered athletes</p>
        </div>
        <a href="/team-admin/roster" className="text-sm font-medium text-brand hover:underline">Manage</a>
      </Card>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <Card className="p-3.5">
      <span className="mb-2 inline-grid h-8 w-8 place-items-center rounded-full bg-surface-3 text-muted">
        <Icon className="h-4 w-4" weight="bold" />
      </span>
      <p data-numeric className={`tabular text-lg font-bold tabular-nums ${accent}`}>{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</p>
    </Card>
  );
}
