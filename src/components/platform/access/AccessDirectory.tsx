'use client';

import { useMemo, useState } from 'react';
import { XCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  DirectoryRow,
  EmptyState,
  PlatformAdminHeader,
  PlatformSearch,
  PlatformStatGrid,
  StatusChip,
} from '@/components/platform/PlatformAdminPrimitives';
import type { TeamAssignment } from '@/types';

function assignmentTone(status: TeamAssignment['status']) {
  if (status === 'active') return 'good';
  if (status === 'revoked') return 'bad';
  return 'warn';
}

export function AccessDirectory() {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const actorUserId = currentUser?.uid ?? userProfile?.uid ?? '';
  const { teamAssignments, teams, leagues, users, loading, retry } = useGoalPlaceData({
    collections: ['teamAssignments', 'teams', 'leagues', 'users'],
    recordLimit: 700,
  });
  const [query, setQuery] = useState('');
  const [revokingId, setRevokingId] = useState('');

  const filtered = useMemo(() => teamAssignments.filter((assignment) => {
    const team = teams.find((item) => item.id === assignment.teamId);
    const league = leagues.find((item) => item.id === assignment.leagueId);
    const user = users.find((item) => item.id === assignment.userId);
    const haystack = `${assignment.invitedEmail ?? ''} ${assignment.userId} ${team?.name ?? ''} ${league?.name ?? ''} ${user?.email ?? ''} ${assignment.status}`.toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  }).sort((left, right) => +new Date(right.createdAt ?? 0) - +new Date(left.createdAt ?? 0)), [leagues, query, teamAssignments, teams, users]);

  async function revokeAssignment(assignment: TeamAssignment) {
    if (!actorUserId) {
      toast.error('Your Platform Operator session is not ready.');
      return;
    }
    setRevokingId(assignment.id);
    try {
      await provider.revokeTeamAssignment(assignment.id, actorUserId, 'Revoked from Platform Admin access directory.');
      toast.success('Assignment revoked and audit event recorded.');
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Assignment could not be revoked.');
    } finally {
      setRevokingId('');
    }
  }

  if (loading) return <Skeleton className="h-[560px] rounded-[var(--radius-lg)]" />;

  return (
    <section className="space-y-5">
      <PlatformAdminHeader
        eyebrow="Network"
        title="Access"
        description="Review operational invitations and assignments separately from ordinary account management."
      />

      <PlatformStatGrid items={[
        { label: 'Invited', value: teamAssignments.filter((item) => item.status === 'invited').length, tone: 'warn' },
        { label: 'Active assignments', value: teamAssignments.filter((item) => item.status === 'active').length, tone: 'good' },
        { label: 'Revoked', value: teamAssignments.filter((item) => item.status === 'revoked').length },
        { label: 'Delivery failures', value: teamAssignments.filter((item) => item.emailDelivery === 'failed').length, tone: 'bad' },
      ]} />

      <Card className="p-4">
        <div className="mb-4">
          <PlatformSearch value={query} onChange={setQuery} placeholder="Search by email, team, league or assignment status" />
        </div>
        <div className="space-y-2.5">
          {filtered.length ? filtered.slice(0, 90).map((assignment) => {
            const team = teams.find((item) => item.id === assignment.teamId);
            const league = leagues.find((item) => item.id === assignment.leagueId);
            const account = users.find((item) => item.id === assignment.userId);
            return (
              <div key={assignment.id} className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
                <DirectoryRow
                  title={assignment.invitedEmail ?? account?.email ?? assignment.userId ?? 'Unclaimed invitation'}
                  meta={`${team?.name ?? assignment.teamId} · ${league?.name ?? assignment.leagueId}`}
                  status={assignment.status}
                  statusTone={assignmentTone(assignment.status)}
                  detail={
                    <div className="flex flex-wrap gap-1.5">
                      <StatusChip label={assignment.emailDelivery ?? 'delivery pending'} tone={assignment.emailDelivery === 'failed' ? 'bad' : assignment.emailDelivery === 'sent' ? 'good' : 'neutral'} />
                      <StatusChip label={`expires ${assignment.expiresAt ? new Date(assignment.expiresAt).toLocaleDateString() : 'not set'}`} />
                      {account?.accountClass ? <StatusChip label={account.accountClass} /> : null}
                    </div>
                  }
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={XCircle} onClick={() => revokeAssignment(assignment)} disabled={revokingId === assignment.id || assignment.status === 'revoked'}>
                    Revoke assignment
                  </Button>
                </div>
              </div>
            );
          }) : (
            <EmptyState title="No access records match this filter">Invitations and scoped assignments will appear here after teams are invited.</EmptyState>
          )}
        </div>
      </Card>
    </section>
  );
}
