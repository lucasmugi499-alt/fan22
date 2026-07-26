'use client';

import { useMemo } from 'react';
import { DownloadSimple, Buildings, Users, ShieldCheck, CalendarCheck, Coins } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
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

export function PlatformReports() {
  const { leagues, teams, athletes, matches, loading } = useGoalPlaceData({
    collections: ['leagues', 'teams', 'athletes', 'matches'],
  });
  const stats = useMemo(() => {
    const played = matches.filter((m) => m.status === 'completed');
    const official = played.filter(isOfficialMatch).length;
    return {
      leagues: leagues.length,
      teams: teams.length,
      athletes: athletes.length,
      official,
      rate: played.length ? Math.round((official / played.length) * 100) : 0,
      support: teams.reduce((s, t) => s + (t.totalSupport ?? 0), 0),
    };
  }, [leagues, teams, athletes, matches]);

  if (loading) return <div className="space-y-3"><Skeleton className="h-8 w-40" /><Skeleton className="h-48 w-full rounded-[var(--radius-lg)]" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-strong">Platform reports</h1>
          <p className="text-sm text-muted">Health of the whole network.</p>
        </div>
        <Button size="sm" variant="secondary" icon={DownloadSimple} onClick={() => toast('Report export arrives in the next build step.')}>Export</Button>
      </div>

      <DemoDataNote />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Big icon={Buildings} label="Leagues" value={String(stats.leagues)} />
        <Big icon={Users} label="Teams" value={String(stats.teams)} />
        <Big icon={Users} label="Athletes" value={String(stats.athletes)} />
        <Big icon={CalendarCheck} label="Official matches" value={String(stats.official)} />
        <Big icon={ShieldCheck} label="Verified rate" value={`${stats.rate}%`} accent="text-[var(--state-verified)]" />
        <Big icon={Coins} label="Support raised" value={ugx(stats.support)} accent="text-[var(--brand-2)]" />
      </div>
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
