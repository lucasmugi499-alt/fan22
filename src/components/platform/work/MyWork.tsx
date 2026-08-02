'use client';

import { useMemo } from 'react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { pendingApprovals, openReports, disputedMatches } from '@/lib/platform/platformContext';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { DirectoryRow, EmptyState, PlatformAdminHeader, PlatformStatGrid, StatusChip } from '@/components/platform/PlatformAdminPrimitives';

export function MyWork() {
  const data = useGoalPlaceData({
    collections: ['leagues', 'athletes', 'matches', 'reports', 'finalizations', 'leagueAdminApplications'],
    recordLimit: 400,
  });

  const queue = useMemo(() => {
    const approvals = pendingApprovals(data.leagues, data.athletes).map((item) => ({
      id: `${item.kind}-${item.id}`,
      href: item.kind === 'league' ? '/admin/applications' : `/athletes/${item.id}`,
      title: item.title,
      meta: item.subtitle,
      status: item.kind === 'league' ? 'application' : 'verification',
      tone: 'warn' as const,
    }));
    const applications = data.leagueAdminApplications
      .filter((item) => ['submitted', 'under_review', 'needs_information', 'risk_review', 'resubmitted'].includes(item.status))
      .map((item) => ({
        id: item.id,
        href: `/admin/applications/${item.id}`,
        title: item.leagueName,
        meta: `${item.city} · ${item.applicantEmail ?? 'no email'} · ${item.status.replace(/_/g, ' ')}`,
        status: 'league application',
        tone: item.status === 'risk_review' ? 'bad' as const : 'warn' as const,
      }));
    const disputes = disputedMatches(data.matches).map((item) => ({
      id: item.id,
      href: '/admin/competition',
        title: `${item.homeTeamId} vs ${item.awayTeamId}`,
      meta: `${item.venue} · result dispute`,
      status: 'disputed',
      tone: 'bad' as const,
    }));
    const reports = openReports(data.reports).map((item) => ({
      id: item.id,
      href: `/admin/trust/${item.id}`,
      title: item.summary,
      meta: `${item.type.replace(/_/g, ' ')} · ${item.severity ?? 'unrated'}`,
      status: item.status,
      tone: item.severity === 'Critical' || item.severity === 'High' ? 'bad' as const : 'warn' as const,
    }));
    const failed = data.finalizations.filter((item) => item.status === 'failed').map((item) => ({
      id: item.id,
      href: '/admin/competition',
      title: `Failed finalization for ${item.matchId}`,
      meta: `${item.source} · version ${item.resultVersion}`,
      status: 'failed',
      tone: 'bad' as const,
    }));
    return [...applications, ...approvals, ...disputes, ...failed, ...reports];
  }, [data]);

  if (data.loading) return <Skeleton className="h-[560px] rounded-[var(--radius-lg)]" />;

  return (
    <section className="space-y-5">
      <PlatformAdminHeader
        eyebrow="Command"
        title="My work"
        description="One prioritized queue for application review, verification cases, result exceptions, failed jobs and trust cases."
      />
      <PlatformStatGrid items={[
        { label: 'Queue items', value: queue.length },
        { label: 'Applications', value: data.leagueAdminApplications.filter((item) => ['submitted', 'under_review', 'needs_information', 'risk_review', 'resubmitted'].includes(item.status)).length, tone: 'warn' },
        { label: 'Result disputes', value: disputedMatches(data.matches).length, tone: 'bad' },
        { label: 'Open reports', value: openReports(data.reports).length, tone: 'warn' },
      ]} />
      <Card className="p-4">
        <div className="space-y-2.5">
          {queue.length ? queue.map((item) => (
            <DirectoryRow
              key={`${item.status}-${item.id}`}
              href={item.href}
              title={item.title}
              meta={item.meta}
              status={item.status}
              statusTone={item.tone}
              detail={<StatusChip label="server owned workflow" />}
            />
          )) : (
            <EmptyState title="No work is waiting">The platform queue is clear for this data window.</EmptyState>
          )}
        </div>
      </Card>
    </section>
  );
}
