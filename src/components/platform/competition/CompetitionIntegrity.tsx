'use client';

import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { isOfficialMatch } from '@/lib/status';
import { disputedMatches } from '@/lib/platform/platformContext';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { DirectoryRow, EmptyState, PlatformAdminHeader, PlatformStatGrid, StatusChip } from '@/components/platform/PlatformAdminPrimitives';

export function CompetitionIntegrity() {
  const data = useGoalPlaceData({
    collections: ['matches', 'finalizations', 'leagues', 'teams'],
    recordLimit: 500,
  });
  const disputes = disputedMatches(data.matches);
  const failedFinalizations = data.finalizations.filter((item) => item.status === 'failed');
  const overdue = data.matches.filter((item) => item.verificationStatus === 'pending' && item.status === 'completed');
  const official = data.matches.filter(isOfficialMatch);

  if (data.loading) return <Skeleton className="h-[560px] rounded-[var(--radius-lg)]" />;

  return (
    <section className="space-y-5">
      <PlatformAdminHeader
        eyebrow="Integrity"
        title="Competition integrity"
        description="Supervise disputes, failed finalizations, corrections and projection readiness without manually rewriting official statistics."
      />
      <PlatformStatGrid items={[
        { label: 'Result disputes', value: disputes.length, tone: disputes.length ? 'bad' : 'good' },
        { label: 'Failed finalizations', value: failedFinalizations.length, tone: failedFinalizations.length ? 'bad' : 'good' },
        { label: 'Pending confirmations', value: overdue.length, tone: overdue.length ? 'warn' : 'good' },
        { label: 'Verified-result rate', value: `${Math.round((official.length / Math.max(1, data.matches.length)) * 100)}%` },
      ]} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-[15px] font-semibold text-text-strong">Result exceptions</h2>
          <div className="space-y-2.5">
            {[...disputes, ...overdue].slice(0, 20).map((match) => (
              <DirectoryRow
                key={match.id}
                href={`/matches/${match.id}`}
                title={`${match.homeTeamId} vs ${match.awayTeamId}`}
                meta={`${match.venue} · ${match.date ?? match.scheduledAt}`}
                status={match.verificationStatus}
                statusTone={match.verificationStatus === 'disputed' ? 'bad' : 'warn'}
                detail={<StatusChip label="correction requires governed versioning" />}
              />
            ))}
            {!disputes.length && !overdue.length ? (
              <EmptyState title="No result exceptions">Disputed and overdue result records will appear here.</EmptyState>
            ) : null}
          </div>
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 text-[15px] font-semibold text-text-strong">Projection health</h2>
          <div className="space-y-2.5">
            {failedFinalizations.length ? failedFinalizations.map((item) => (
              <DirectoryRow
                key={item.id}
                title={`Finalization ${item.id}`}
                meta={`${item.matchId} · ${item.source} · version ${item.resultVersion}`}
                status={item.status}
                statusTone="bad"
                detail={<StatusChip label="retry must be idempotent" tone="warn" />}
              />
            )) : (
              <EmptyState title="No failed finalizations">Projection jobs are clean in the loaded data window.</EmptyState>
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}
