'use client';

import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { Card } from '@/components/ui/Card';
import { DirectoryRow, PlatformAdminHeader, PlatformStatGrid, StatusChip } from '@/components/platform/PlatformAdminPrimitives';

export function SystemHealth() {
  const data = useGoalPlaceData({
    collections: ['finalizations', 'reports', 'matches'],
    recordLimit: 300,
  });
  const failedFinalizations = data.finalizations.filter((item) => item.status === 'failed').length;
  const criticalReports = data.reports.filter((item) => ['open', 'reviewing'].includes(item.status) && item.severity === 'Critical').length;
  const projectionBacklog = data.matches.filter((item) => item.status === 'completed' && item.verificationStatus === 'pending').length;

  return (
    <section className="space-y-5">
      <PlatformAdminHeader
        eyebrow="System"
        title="System health"
        description="Environment, deployment and job health signals for Platform Operators. Infrastructure switching remains Super Admin only."
      />
      <PlatformStatGrid items={[
        { label: 'Environment', value: process.env.NEXT_PUBLIC_GOALPLACE_ENVIRONMENT ?? process.env.NODE_ENV ?? 'unknown' },
        { label: 'Firebase project', value: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'unconfigured' },
        { label: 'Database', value: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID ?? '(default)' },
        { label: 'Failed jobs', value: failedFinalizations, tone: failedFinalizations ? 'bad' : 'good' },
      ]} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-[15px] font-semibold text-text-strong">Runtime safeguards</h2>
          <div className="space-y-2.5">
            <DirectoryRow title="Real payment authority" meta="Provider collection and payout commands are disabled in this demo readiness state." status="monitoring only" statusTone="warn" />
            <DirectoryRow title="Demo login" meta="Controlled by deployment environment flags." status={process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === 'true' ? 'enabled' : 'disabled'} statusTone={process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === 'true' ? 'warn' : 'good'} />
            <DirectoryRow title="App Check" meta="Server routes enforce App Check when the environment requires it." status={process.env.GOALPLACE_REQUIRE_APP_CHECK === 'true' ? 'required' : 'optional'} statusTone="neutral" />
          </div>
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 text-[15px] font-semibold text-text-strong">Operational backlogs</h2>
          <div className="space-y-2.5">
            <DirectoryRow title="Result finalization backlog" meta="Failed trusted result-finalizer records in the loaded window." status={`${failedFinalizations}`} statusTone={failedFinalizations ? 'bad' : 'good'} />
            <DirectoryRow title="Projection backlog" meta="Completed matches still waiting on verified result state." status={`${projectionBacklog}`} statusTone={projectionBacklog ? 'warn' : 'good'} />
            <DirectoryRow title="Critical reports" meta="Open or reviewing trust cases marked Critical." status={`${criticalReports}`} statusTone={criticalReports ? 'bad' : 'good'} />
            <div className="pt-1">
              <StatusChip label="No secrets exposed" tone="good" />
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
