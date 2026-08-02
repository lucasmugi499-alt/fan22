'use client';

import { useMemo, useState } from 'react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { DirectoryRow, EmptyState, PlatformAdminHeader, PlatformSearch, PlatformStatGrid, StatusChip } from '@/components/platform/PlatformAdminPrimitives';

export function ApplicationDirectory() {
  const { leagueAdminApplications, loading } = useGoalPlaceData({
    collections: ['leagueAdminApplications'],
    recordLimit: 300,
  });
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => leagueAdminApplications.filter((application) => {
    const haystack = `${application.leagueName} ${application.applicantName ?? ''} ${application.applicantEmail ?? ''} ${application.city} ${application.region ?? ''} ${application.status}`.toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  }).sort((left, right) => +new Date(right.updatedAt ?? right.createdAt) - +new Date(left.updatedAt ?? left.createdAt)), [leagueAdminApplications, query]);

  if (loading) return <Skeleton className="h-[520px] rounded-[var(--radius-lg)]" />;

  return (
    <section className="space-y-5">
      <PlatformAdminHeader
        eyebrow="Network"
        title="Applications"
        description="Review public league applications without converting Fan accounts into operators."
      />
      <PlatformStatGrid items={[
        { label: 'Submitted', value: leagueAdminApplications.filter((item) => ['pending', 'submitted', 'resubmitted'].includes(item.status)).length, tone: 'warn' },
        { label: 'Under review', value: leagueAdminApplications.filter((item) => item.status === 'under_review').length },
        { label: 'Needs information', value: leagueAdminApplications.filter((item) => item.status === 'needs_information').length, tone: 'warn' },
        { label: 'Approved', value: leagueAdminApplications.filter((item) => item.status === 'approved' || item.status === 'converted_to_onboarding').length, tone: 'good' },
      ]} />
      <Card className="p-4">
        <div className="mb-4">
          <PlatformSearch value={query} onChange={setQuery} placeholder="Search applications by league, applicant, email or region" />
        </div>
        <div className="space-y-2.5">
          {filtered.length ? filtered.map((application) => (
            <DirectoryRow
              key={application.id}
              href={`/admin/applications/${application.id}`}
              title={application.leagueName}
              meta={`${application.city} · ${application.sport} · ${application.applicantEmail ?? 'applicant email pending'}`}
              status={application.status}
              statusTone={application.status === 'approved' || application.status === 'converted_to_onboarding' ? 'good' : application.status === 'rejected' ? 'bad' : 'warn'}
              detail={
                <div className="flex flex-wrap gap-1.5">
                  <StatusChip label={`${application.estimatedTeams ?? 0} teams estimated`} />
                  <StatusChip label={`${application.riskFlags?.length ?? 0} risk flags`} tone={application.riskFlags?.length ? 'bad' : 'neutral'} />
                  {application.invitationId ? <StatusChip label="operator invite created" tone="good" /> : null}
                </div>
              }
            />
          )) : (
            <EmptyState title="No applications match this filter">Public league applications will appear here after submission.</EmptyState>
          )}
        </div>
      </Card>
    </section>
  );
}
