'use client';

import { useMemo } from 'react';
import { UserPlus, Users as UsersIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyTeam, rosterForTeam } from '@/lib/team/teamContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { VerificationBadge } from '@/components/ui/StatusBadge';
import { normalizeVerificationStatus } from '@/lib/status';

export function TeamRoster() {
  const { userProfile, isDemoMode } = useAuth();
  const { teams, athletes, matches, loading } = useGoalPlaceData({
    collections: ['teams', 'athletes', 'matches'],
  });

  const team = useMemo(() => resolveMyTeam(userProfile, teams, matches, isDemoMode), [userProfile, teams, matches, isDemoMode]);
  const roster = useMemo(() => (team ? rosterForTeam(team.id, athletes) : []), [team, athletes]);

  const addAthlete = () => toast('Roster editing arrives in the next build step.');

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-32" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-[var(--radius-lg)]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-strong">Roster</h1>
          <p className="text-sm text-muted">
            <span className="tabular tabular-nums">{roster.length}</span> registered athletes
          </p>
        </div>
        <Button size="sm" icon={UserPlus} onClick={addAthlete}>
          Add athlete
        </Button>
      </div>

      {roster.length ? (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {roster.map((a) => {
            const vs = normalizeVerificationStatus(a.verificationStatus);
            return (
              <li key={a.id}>
                <Card className="flex items-center gap-3 p-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-bold text-muted">
                    {a.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-strong">{a.name}</p>
                    <p className="truncate text-xs text-muted">{a.position}</p>
                  </div>
                  <VerificationBadge status={vs} size="sm" />
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={UsersIcon}
          title="No athletes yet"
          description="Add your players to build the roster. Each can then request verification to earn a verified profile."
          action={<Button size="sm" icon={UserPlus} onClick={addAthlete}>Add your first athlete</Button>}
        />
      )}
    </div>
  );
}
