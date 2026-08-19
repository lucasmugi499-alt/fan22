'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthProvider';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { PlatformAdminHeader, PlatformStatGrid, StatusChip } from '@/components/platform/PlatformAdminPrimitives';

type ControlPlaneState = {
  demo: { environment: string; active: boolean; publicBaseUrl: string | null };
  finalizer: { modeThisOrigin: string; canaryAllowlistSize: number };
  beta: { present: boolean; placeholders: boolean; placeholderMarkers: string[]; ready: boolean; blockedBy: string };
  production: { present: boolean; placeholders: boolean; placeholderMarkers: string[]; ready: boolean; blockedBy: string };
  scheduledJobs: { state: string; note: string };
  competitionIntegrity: { openCases: number | null; note?: string };
  trafficSwitching: { available: boolean; reason: string };
};

/**
 * The Control Plane reports; it does not pretend to act.
 *
 * There is deliberately no "activate beta" or "go to production" control. Environment
 * activation in this repository prepares configuration and records intent — it does not
 * retarget traffic, because no gateway or DNS mechanism exists here to retarget. A toggle
 * would be the single most dangerous thing on this console: an operator would press it,
 * see a success state, and believe traffic moved.
 *
 * When routing authority exists, the control that replaces this reporting view should be a
 * workflow — readiness checks, typed confirmation, an approval record, maintenance mode,
 * the routing change, smoke confirmation, immutable audit — not a switch.
 */
export function ControlPlane() {
  const { currentUser } = useAuth();
  const [state, setState] = useState<ControlPlaneState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await currentUser?.getIdToken();
        const response = await fetch('/api/platform/control-plane', {
          headers: { authorization: `Bearer ${token ?? ''}` },
          cache: 'no-store',
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Control plane state is unavailable.');
        if (active) setState(body as ControlPlaneState);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Control plane state is unavailable.');
      }
    })();
    return () => { active = false; };
  }, [currentUser]);

  if (error) return <Card className="p-4"><p className="text-sm text-[var(--state-disputed)]">{error}</p></Card>;
  if (!state) return <Skeleton className="h-[480px] rounded-[var(--radius-lg)]" />;

  return (
    <section className="space-y-5">
      <PlatformAdminHeader
        eyebrow="Control plane"
        title="Environment and release state"
        description="Measured state, not intentions. Nothing here switches traffic, because no routing mechanism exists to switch."
      />
      <PlatformStatGrid items={[
        { label: 'Demo', value: state.demo.active ? 'active' : 'inactive', tone: state.demo.active ? 'good' : 'warn' },
        { label: 'Beta', value: 'not ready', tone: 'warn' },
        { label: 'Production', value: 'blocked', tone: 'bad' },
        { label: 'Finalizer (this origin)', value: state.finalizer.modeThisOrigin, tone: state.finalizer.modeThisOrigin === 'enabled' ? 'good' : 'warn' },
      ]} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-[15px] font-semibold text-text-strong">Release readiness</h2>
          <div className="space-y-3">
            {(['beta', 'production'] as const).map((key) => {
              const item = state[key];
              return (
                <div key={key} className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold capitalize text-text-strong">{key}</p>
                    <StatusChip label={item.ready ? 'ready' : 'not ready'} />
                  </div>
                  <p className="mt-1 text-sm text-muted">{item.blockedBy}</p>
                  {item.placeholderMarkers.length ? (
                    <p className="mt-1 text-xs text-subtle">
                      Placeholders found: {item.placeholderMarkers.join(', ')}
                    </p>
                  ) : null}
                </div>
              );
            })}
            <p className="text-xs text-subtle">
              Readiness is reported, never actioned here. Activating an environment is a
              guarded workflow — checks, typed confirmation, approval, maintenance, routing
              change, smoke tests, audit — and the routing step does not yet exist.
            </p>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-[15px] font-semibold text-text-strong">Operational state</h2>
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted">Finalizer mode (this origin)</dt>
              <dd className="font-semibold text-text-strong">{state.finalizer.modeThisOrigin}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted">Canary allowlist</dt>
              <dd className="font-semibold text-text-strong">{state.finalizer.canaryAllowlistSize} submission(s)</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted">Scheduled jobs</dt>
              <dd className="text-right font-semibold text-text-strong">not visible from the app</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted">Open integrity cases</dt>
              <dd className="font-semibold text-text-strong">
                {state.competitionIntegrity.openCases ?? 'unavailable'}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-subtle">
            {state.scheduledJobs.note} Open cases are listed in{' '}
            <Link href="/admin/competition" className="text-brand hover:underline">Competition integrity</Link>.
          </p>
          <p className="mt-2 text-xs text-subtle">
            The Cloud Functions runtime holds its own copy of the finalizer switch. This
            reports what THIS origin would apply; the two are configured separately.
          </p>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-2 text-[15px] font-semibold text-text-strong">Traffic routing</h2>
        <p className="text-sm text-muted">{state.trafficSwitching.reason}</p>
      </Card>
    </section>
  );
}
