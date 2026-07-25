'use client';

import { useMemo } from 'react';
import { DownloadSimple, ShieldCheck, Coins, Users, CalendarCheck } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyLeague, teamsInLeague, matchesInLeague, verifiedRate } from '@/lib/league/leagueContext';
import { isOfficialMatch } from '@/lib/status';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { DemoDataNote } from '@/components/ui/DemoDataNote';

function ugx(n: number): string {
  if (n >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `UGX ${(n / 1_000).toFixed(0)}k`;
  return `UGX ${n}`;
}

export function LeagueReports() {
  const { userProfile, isDemoMode } = useAuth();
  const { leagues, teams, athletes, matches, loading } = useGoalPlaceData();

  const league = useMemo(() => resolveMyLeague(userProfile, leagues, matches, isDemoMode), [userProfile, leagues, matches, isDemoMode]);
  const stats = useMemo(() => {
    if (!league) return null;
    const lTeams = teamsInLeague(league.id, teams);
    const lMatches = matchesInLeague(league.id, matches);
    const lAthletes = athletes.filter((a) => a.leagueId === league.id);
    return {
      support: lTeams.reduce((s, t) => s + (t.totalSupport ?? 0), 0),
      supporters: lTeams.reduce((s, t) => s + (t.supportersCount ?? 0), 0),
      official: lMatches.filter(isOfficialMatch).length,
      athletes: lAthletes.length,
      rate: verifiedRate(league.id, matches),
      teams: lTeams.length,
    };
  }, [league, teams, athletes, matches]);

  if (loading || !stats) {
    return <div className="space-y-3"><Skeleton className="h-8 w-40" /><Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-strong">Reports</h1>
          <p className="text-sm text-muted">Verified activity and impact for sponsors.</p>
        </div>
        <Button size="sm" variant="secondary" icon={DownloadSimple} onClick={() => toast('Report export arrives in the next build step.')}>
          Export
        </Button>
      </div>

      <DemoDataNote />

      <div className="grid grid-cols-2 gap-2.5">
        <Big icon={Coins} label="Support raised" value={ugx(stats.support)} accent="text-[var(--brand-2)]" />
        <Big icon={ShieldCheck} label="Verified results" value={`${stats.rate}%`} accent="text-[var(--state-verified)]" />
        <Big icon={CalendarCheck} label="Official matches" value={String(stats.official)} accent="text-text-strong" />
        <Big icon={Users} label="Supporters" value={String(stats.supporters)} accent="text-text-strong" />
      </div>

      <Card className="p-4">
        <p className="text-sm font-semibold text-text-strong">Why sponsors trust this</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Every figure here is built from official results only. A result becomes official after
          the opposing team confirms it and GoalPlace256 finalizes it, so reported activity reflects
          what actually happened on the pitch, not unverified claims.
        </p>
      </Card>
    </div>
  );
}

function Big({ icon: Icon, label, value, accent }: { icon: typeof Coins; label: string; value: string; accent: string }) {
  return (
    <Card className="p-4">
      <span className="mb-2 inline-grid h-9 w-9 place-items-center rounded-full bg-surface-3 text-muted">
        <Icon className="h-5 w-5" weight="bold" />
      </span>
      <p data-numeric className={`tabular text-xl font-bold tabular-nums ${accent}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</p>
    </Card>
  );
}
