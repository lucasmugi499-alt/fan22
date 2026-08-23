'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  DirectoryRow,
  EmptyState,
  PlatformAdminHeader,
  PlatformStatGrid,
} from '@/components/platform/PlatformAdminPrimitives';

/**
 * System health, read from the server.
 *
 * This panel previously read `process.env.GOALPLACE_REQUIRE_APP_CHECK` in the browser.
 * That variable is server-only, so it was always undefined here and App Check always
 * displayed as "optional" — including in an environment that required it. A safeguard
 * indicator that fails toward "looks fine" is worse than none. It also showed a
 * hardcoded "No secrets exposed" badge asserting a control nobody had verified; that
 * claim is removed rather than restated.
 */

type SystemHealthPayload = {
  environment: {
    name: string;
    firebaseProjectId: string | null;
    firestoreDatabaseId: string | null;
  };
  safeguards: {
    appCheckRequired: boolean;
    schedulerAuthMode: string;
    accessEngineMode: string;
    accessAuthorityIsCanonical: boolean;
    demoLoginEnabled: boolean;
    seedingEnabled: boolean;
    realPaymentsEnabled: boolean;
    investorToolsEnabled: boolean;
  };
  backlogs: {
    failedFinalizations: number;
    projectionBacklog: number;
    pendingMediaModeration: number;
    rejectedUploads: number;
    accessAuthorityDivergences: number;
    projectionRepairsPending: number;
  };
};

export function SystemHealth() {
  const { currentUser, isDemoMode } = useAuth();
  const [payload, setPayload] = useState<SystemHealthPayload | null>(null);
  const [loading, setLoading] = useState(!isDemoMode);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (isDemoMode) return;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const token = await currentUser?.getIdToken();
        if (!token) throw new Error('Sign in again to read system health.');
        const response = await fetch('/api/platform/system-health', {
          headers: { authorization: `Bearer ${token}` },
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? 'System health is unavailable.');
        if (!cancelled) setPayload(body);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'System health is unavailable.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [currentUser, isDemoMode]);

  if (loading) return <Skeleton className="h-[520px] rounded-[var(--radius-lg)]" />;

  if (error || !payload) {
    return (
      <section className="space-y-5">
        <PlatformAdminHeader eyebrow="System" title="System health" description="Server-reported runtime state." />
        <Card className="p-4">
          <EmptyState title="System health is unavailable">
            {error || 'No system health data was returned. Nothing is asserted about runtime safeguards while this is unknown.'}
          </EmptyState>
        </Card>
      </section>
    );
  }

  const { environment, safeguards, backlogs } = payload;

  return (
    <section className="space-y-5">
      <PlatformAdminHeader
        eyebrow="System"
        title="System health"
        description="Runtime safeguards and backlogs, read from the server that enforces them. Infrastructure switching remains Super Admin only."
      />

      <PlatformStatGrid items={[
        { label: 'Environment', value: environment.name },
        { label: 'Firebase project', value: environment.firebaseProjectId ?? 'unconfigured' },
        { label: 'Database', value: environment.firestoreDatabaseId ?? '(default)' },
        { label: 'Failed jobs', value: backlogs.failedFinalizations, tone: backlogs.failedFinalizations ? 'bad' : 'good' },
      ]} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-[15px] font-semibold text-text-strong">Runtime safeguards</h2>
          <div className="space-y-2.5">
            <DirectoryRow
              title="App Check"
              meta="Whether the server currently rejects requests without a valid App Check token."
              status={safeguards.appCheckRequired ? 'required' : 'not required'}
              statusTone={safeguards.appCheckRequired ? 'good' : 'warn'}
            />
            <DirectoryRow
              title="Access authority"
              meta="Canonical assignments govern authorization only in 'assignments' mode; 'compare' and 'legacy' both answer from the legacy projection."
              status={safeguards.accessEngineMode}
              statusTone={safeguards.accessAuthorityIsCanonical ? 'good' : 'warn'}
            />
            <DirectoryRow
              title="Scheduler authentication"
              meta="OIDC is required for beta and production schedulers."
              status={safeguards.schedulerAuthMode}
              statusTone={safeguards.schedulerAuthMode === 'oidc' ? 'good' : 'warn'}
            />
            <DirectoryRow
              title="Real payment authority"
              meta="Provider collection and payout commands."
              status={safeguards.realPaymentsEnabled ? 'ENABLED' : 'disabled'}
              statusTone={safeguards.realPaymentsEnabled ? 'bad' : 'good'}
            />
            <DirectoryRow
              title="Demo login"
              meta="Must be disabled outside the demo environment."
              status={safeguards.demoLoginEnabled ? 'enabled' : 'disabled'}
              statusTone={safeguards.demoLoginEnabled ? 'warn' : 'good'}
            />
            <DirectoryRow
              title="Seeding"
              meta="Synthetic data writes."
              status={safeguards.seedingEnabled ? 'enabled' : 'disabled'}
              statusTone={safeguards.seedingEnabled ? 'warn' : 'good'}
            />
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-[15px] font-semibold text-text-strong">Operational backlogs</h2>
          <div className="space-y-2.5">
            <DirectoryRow
              title="Result finalization failures"
              meta="Trusted finalizer records in a failed state."
              status={`${backlogs.failedFinalizations}`}
              statusTone={backlogs.failedFinalizations ? 'bad' : 'good'}
            />
            <DirectoryRow
              title="Projection backlog"
              meta="Completed matches still waiting on a verified result."
              status={`${backlogs.projectionBacklog}`}
              statusTone={backlogs.projectionBacklog ? 'warn' : 'good'}
            />
            <DirectoryRow
              title="Media awaiting moderation"
              meta="Uploads verified against their authorization but not yet published."
              status={`${backlogs.pendingMediaModeration}`}
              statusTone={backlogs.pendingMediaModeration ? 'warn' : 'good'}
            />
            <DirectoryRow
              title="Rejected uploads"
              meta="Objects that failed verification against what was authorized."
              status={`${backlogs.rejectedUploads}`}
              statusTone="neutral"
            />
            <DirectoryRow
              title="Access authority divergences"
              meta="Scopes where legacy and canonical authority disagree. Must reach zero before legacy authorization is removed."
              status={`${backlogs.accessAuthorityDivergences}`}
              statusTone={backlogs.accessAuthorityDivergences ? 'bad' : 'good'}
            />
            <DirectoryRow
              title="Projection repairs pending"
              meta="Projections that fell behind their source. A search-index failure never blocks the write that caused it, so this queue is what stops 'swallowed' meaning 'silently stale'."
              status={`${backlogs.projectionRepairsPending ?? 0}`}
              statusTone={backlogs.projectionRepairsPending ? 'warn' : 'good'}
            />
          </div>
        </Card>
      </div>
    </section>
  );
}
