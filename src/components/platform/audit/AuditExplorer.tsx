'use client';

import { useMemo, useState } from 'react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { DirectoryRow, EmptyState, PlatformAdminHeader, PlatformSearch, PlatformStatGrid, StatusChip } from '@/components/platform/PlatformAdminPrimitives';

function dateLabel(value?: string) {
  if (!value) return 'No timestamp';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

export function AuditExplorer() {
  const { adminAuditEvents, loading } = useGoalPlaceData({
    collections: ['adminAuditEvents'],
    recordLimit: 500,
  });
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => adminAuditEvents.filter((event) => {
    const haystack = `${event.action} ${event.actorUserId} ${event.targetCollection} ${event.targetId} ${event.note ?? ''}`.toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  }).sort((left, right) => +new Date(right.createdAt) - +new Date(left.createdAt)), [adminAuditEvents, query]);

  if (loading) return <Skeleton className="h-[560px] rounded-[var(--radius-lg)]" />;

  return (
    <section className="space-y-5">
      <PlatformAdminHeader
        eyebrow="System"
        title="Audit"
        description="Read-only history of sensitive platform actions. Browser administrators cannot edit or delete these records."
      />
      <PlatformStatGrid items={[
        { label: 'Audit records', value: adminAuditEvents.length },
        { label: 'Approvals', value: adminAuditEvents.filter((item) => item.action === 'approved').length, tone: 'good' },
        { label: 'Revocations', value: adminAuditEvents.filter((item) => item.action === 'revoked').length, tone: 'warn' },
        { label: 'Suspensions', value: adminAuditEvents.filter((item) => item.action === 'suspended' || item.action === 'blocked').length, tone: 'bad' },
      ]} />
      <Card className="p-4">
        <div className="mb-4">
          <PlatformSearch value={query} onChange={setQuery} placeholder="Filter by actor, action, target or note" />
        </div>
        <div className="space-y-2.5">
          {filtered.length ? filtered.slice(0, 120).map((event) => (
            <DirectoryRow
              key={event.id}
              title={event.action.replace(/_/g, ' ')}
              meta={`${event.targetCollection}/${event.targetId} · ${event.actorUserId}`}
              status={dateLabel(event.createdAt)}
              statusTone="neutral"
              detail={
                <div className="flex flex-wrap gap-1.5">
                  <StatusChip label="immutable" tone="good" />
                  {event.note ? <span className="text-xs text-muted">{event.note}</span> : null}
                </div>
              }
            />
          )) : (
            <EmptyState title="No audit records match this filter">Audit events are server-owned and read-only.</EmptyState>
          )}
        </div>
      </Card>
    </section>
  );
}
