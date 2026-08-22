'use client';

import { useMemo } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyAthlete } from '@/lib/athlete/athleteContext';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { AthleteClaiming } from '@/components/athlete/AthleteClaiming';
import { PayeePortal } from '@/components/athlete/PayeePortal';

/**
 * Resolves which athlete the signed-in person is, then hands off to the portal.
 *
 * An unclaimed profile lands on the same claiming flow the dashboard uses, because claiming
 * is now what an athlete account is FOR: it does not unlock profile editing, it connects a
 * person to the record so they can state where their money goes.
 */
export function MyPayouts() {
  const { userProfile, isDemoMode } = useAuth();
  const { athletes, loading, retry } = useGoalPlaceData({ collections: ['athletes'], recordLimit: 1200 });
  const athlete = useMemo(
    () => resolveMyAthlete(userProfile, athletes, isDemoMode),
    [userProfile, athletes, isDemoMode],
  );

  if (loading) return <Skeleton className="h-[520px] rounded-[var(--radius-lg)]" />;
  if (!athlete) {
    return (
      <div className="space-y-4">
        <Card className="p-4">
          <p className="text-sm font-semibold text-text-strong">Connect your profile first</p>
          <p className="mt-1 text-sm text-muted">
            Your club created your profile. Confirm it is yours and you can set where your
            support is paid out.
          </p>
        </Card>
        <AthleteClaiming athletes={athletes} onChanged={retry} />
      </div>
    );
  }

  return <PayeePortal athleteId={athlete.id} />;
}
