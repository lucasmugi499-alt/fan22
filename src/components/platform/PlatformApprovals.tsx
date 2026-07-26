'use client';

import { useMemo, useState } from 'react';
import { CheckCircle, XCircle, SealCheck } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { pendingApprovals, type ApprovalItem } from '@/lib/platform/platformContext';
import { QueueItem } from '@/components/core/QueueItem';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { STATE } from '@/lib/statusSystem';

export function PlatformApprovals() {
  const { leagues, athletes, loading } = useGoalPlaceData({
    collections: ['leagues', 'athletes'],
  });
  const items = useMemo(() => pendingApprovals(leagues, athletes), [leagues, athletes]);
  const [active, setActive] = useState<ApprovalItem | null>(null);

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-8 w-40" /><Skeleton className="h-16 w-full rounded-[var(--radius-lg)]" /><Skeleton className="h-16 w-full rounded-[var(--radius-lg)]" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text-strong">Approvals</h1>
        <p className="text-sm text-muted">Leagues and athletes cannot self-promote. The platform signs them off.</p>
      </div>

      {items.length ? (
        <div className="space-y-2.5">
          {items.map((it) => (
            <QueueItem
              key={`${it.kind}-${it.id}`}
              state={STATE.pending}
              title={it.title}
              subtitle={it.subtitle}
              meta={it.kind === 'league' ? 'League listing' : 'Athlete verification'}
              onClick={() => setActive(it)}
            />
          ))}
        </div>
      ) : (
        <EmptyState icon={SealCheck} title="All caught up" description="No leagues or athletes are waiting on approval right now." />
      )}

      {active ? (
        <Sheet
          open
          onClose={() => setActive(null)}
          title={active.kind === 'league' ? 'Approve league' : 'Verify athlete'}
          description={active.title}
          footer={
            <div className="flex gap-2">
              <Button block variant="secondary" icon={XCircle} onClick={() => { toast('Sent back with a request for more detail.'); setActive(null); }}>
                Request info
              </Button>
              <Button block icon={CheckCircle} onClick={() => { toast.success(`${active.title} approved.`); setActive(null); }}>
                Approve
              </Button>
            </div>
          }
        >
          <p className="text-sm text-muted">{active.subtitle}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Approving grants {active.kind === 'league' ? 'this league verified status on the platform' : 'this athlete a verified profile'}. This is a governance decision reserved for platform admins, and it is recorded in the audit trail.
          </p>
        </Sheet>
      ) : null}
    </div>
  );
}
