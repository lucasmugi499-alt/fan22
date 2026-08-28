'use client';

import { useMemo } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyLeague } from '@/lib/league/leagueContext';
import { Skeleton } from '@/components/ui/Skeleton';
import { NoAssignment } from '@/components/ui/NoAssignment';

/**
 * League configuration, and who administers it.
 *
 * Deliberately holds no operational actions. Assigning a Field Manager or reviewing an
 * exception is work, and work belongs in the workspace where it happens; a settings page that
 * hides operations is how an admin ends up hunting for the thing they do every week.
 */
export function LeagueSettings() {
  const { userProfile, isDemoMode, accessContext } = useAuth();
  const catalog = useGoalPlaceData({ collections: ['leagues'] });
  const league = useMemo(
    () => resolveMyLeague(userProfile, catalog.leagues, [], isDemoMode, accessContext),
    [userProfile, catalog.leagues, isDemoMode, accessContext],
  );

  if (catalog.loading) return <Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" />;
  if (!league) return <NoAssignment kind="league" />;

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand">Settings</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-strong sm:text-3xl">
          League settings
        </h1>
      </header>

      <section className="rounded-[var(--radius-lg)] border border-border bg-surface-1 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">League profile</p>
        <dl className="mt-2 space-y-1.5 text-sm">
          <Row label="Name" value={league.name} />
          <Row label="Sport" value={String(league.sport)} />
          <Row label="City" value={league.city} />
          <Row label="Status" value={String(league.status)} />
        </dl>
      </section>

      {/*
        One bundle, no permissions matrix. Every League Admin holds complete League
        Administration; multiple admins exist for redundancy, not for tiers of access.
      */}
      <section className="rounded-[var(--radius-lg)] border border-border bg-surface-1 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">League Admins</p>
        <p className="mt-1.5 text-sm leading-6 text-muted">
          Every League Admin has the same access: full League Administration. Add a second so
          the league keeps running when one of you is unavailable, and so a conflicted
          exception has somebody neutral to resolve it.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">
          Adding and removing administrators is a governed access change; it runs through the
          access workflow rather than from this page, and the last active administrator cannot
          be removed.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-text-strong">{value}</dd>
    </div>
  );
}
