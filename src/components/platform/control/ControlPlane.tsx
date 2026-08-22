'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthProvider';
import { ROUTING_BLOCKER } from '@/lib/platform/environmentActivation';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { PlatformAdminHeader, PlatformStatGrid, StatusChip } from '@/components/platform/PlatformAdminPrimitives';

type EnvironmentReport = {
  present: boolean;
  placeholders: boolean;
  placeholderMarkers: string[];
  ready: boolean;
  blockers: string[];
};

type ControlPlanePayload = {
  demo: { environment: string; active: boolean; publicBaseUrl: string | null };
  finalizer: { modeThisOrigin: string; canaryAllowlistSize: number };
  beta: EnvironmentReport;
  production: EnvironmentReport;
  scheduledJobs: { state: string; note: string };
  competitionIntegrity: { openCases: number | null; note?: string };
  trafficSwitching: { available: boolean; reason: string };
};

/**
 * What the console is willing to state.
 *
 * Every server-measured field is nullable, and null renders as "not measured" rather than
 * as a zero or a dash. The demo persona has no server reading at all, so it produces a state
 * where those fields are null on purpose — a console that showed a plausible-looking number
 * for an unmeasured value would be worse than one that showed nothing.
 */
type ControlPlaneState = {
  measured: boolean;
  environment: string | null;
  finalizerMode: string | null;
  canaryAllowlistSize: number | null;
  beta: EnvironmentReport | null;
  production: EnvironmentReport | null;
  scheduledJobsNote: string;
  openIntegrityCases: number | null;
  trafficSwitching: { available: boolean; reason: string };
};

const NOT_MEASURED = 'not measured';

/**
 * The demo persona's state: nothing measured, everything that is a fact about the code
 * still stated.
 *
 * Demo sign-in issues a stand-in user with no Firebase token, so no platform endpoint can
 * be called. That is not an error to display — it is a mode in which this page can honestly
 * report the routing position (a property of the code, true in every environment) while
 * refusing to report the runtime readings it cannot take.
 */
const DEMO_STATE: ControlPlaneState = {
  measured: false,
  environment: 'demo',
  finalizerMode: null,
  canaryAllowlistSize: null,
  beta: null,
  production: null,
  scheduledJobsNote: 'Verify with `firebase functions:list`. The app cannot see the deployed function set.',
  openIntegrityCases: null,
  trafficSwitching: {
    available: false,
    reason: 'Environment activation prepares configuration and records intent. It does not retarget traffic; no gateway or DNS control exists in this deployment.',
  },
};

function fromPayload(payload: ControlPlanePayload): ControlPlaneState {
  return {
    measured: true,
    environment: payload.demo.environment,
    finalizerMode: payload.finalizer.modeThisOrigin,
    canaryAllowlistSize: payload.finalizer.canaryAllowlistSize,
    beta: payload.beta,
    production: payload.production,
    scheduledJobsNote: payload.scheduledJobs.note,
    openIntegrityCases: payload.competitionIntegrity.openCases,
    trafficSwitching: payload.trafficSwitching,
  };
}

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
  const { currentUser, isDemoMode } = useAuth();
  const [payload, setPayload] = useState<ControlPlanePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The demo persona holds a stand-in user with no getIdToken, so there is nothing to
    // authenticate with and no request worth making.
    if (isDemoMode) return;
    let active = true;
    void (async () => {
      try {
        if (!currentUser || typeof currentUser.getIdToken !== 'function') {
          throw new Error('Sign in again to read control-plane state.');
        }
        const token = await currentUser.getIdToken();
        const response = await fetch('/api/platform/control-plane', {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? 'Control plane state is unavailable.');
        if (active) setPayload(body as ControlPlanePayload);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Control plane state is unavailable.');
      }
    })();
    return () => { active = false; };
  }, [currentUser, isDemoMode]);

  const state = useMemo(
    () => (isDemoMode ? DEMO_STATE : payload ? fromPayload(payload) : null),
    [isDemoMode, payload],
  );

  if (!isDemoMode && error) {
    return <Card className="p-4"><p className="text-sm text-[var(--state-disputed)]">{error}</p></Card>;
  }
  if (!state) return <Skeleton className="h-[480px] rounded-[var(--radius-lg)]" />;

  return (
    <section className="space-y-5">
      <PlatformAdminHeader
        eyebrow="Control plane"
        title="Environment and release state"
        description="Measured state, not intentions. Nothing here switches traffic, because no routing mechanism exists to switch."
      />

      {state.measured ? null : (
        <Card className="p-4">
          <p className="text-sm text-text-strong">Demo session — nothing on this page is measured.</p>
          <p className="mt-1 text-sm text-muted">
            Reading control-plane state needs a signed-in platform operator. The demo persona
            has no such session, so runtime readings are shown as {NOT_MEASURED} rather than
            filled with plausible values. The routing position below is a property of the
            code and is true in every environment.
          </p>
        </Card>
      )}

      <PlatformStatGrid items={[
        { label: 'Environment', value: state.environment ?? NOT_MEASURED, tone: state.measured ? 'good' : 'warn' },
        {
          label: 'Beta',
          value: state.beta ? (state.beta.ready ? 'ready' : 'not ready') : NOT_MEASURED,
          tone: state.beta?.ready ? 'good' : 'warn',
        },
        {
          label: 'Production',
          value: state.production ? (state.production.ready ? 'ready' : 'blocked') : NOT_MEASURED,
          // Unmeasured is not the same as blocked, and must not be coloured like it.
          tone: state.production ? (state.production.ready ? 'good' : 'bad') : 'warn',
        },
        {
          label: 'Finalizer (this origin)',
          value: state.finalizerMode ?? NOT_MEASURED,
          tone: state.finalizerMode === 'enabled' ? 'good' : 'warn',
        },
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
                    <StatusChip label={item ? (item.ready ? 'ready' : 'not ready') : NOT_MEASURED} />
                  </div>
                  {item ? (
                    <>
                      {/* Every blocker, not the first one. An operator told only about
                          placeholders would fix them and expect to be ready. */}
                      <ul className="mt-1.5 space-y-1">
                        {item.blockers.map((blocker) => (
                          <li key={blocker} className="flex gap-2 text-sm text-muted">
                            <span aria-hidden className="text-subtle">—</span>
                            <span>{blocker}</span>
                          </li>
                        ))}
                      </ul>
                      {item.placeholderMarkers.length ? (
                        <p className="mt-1 text-xs text-subtle">
                          Placeholders found: {item.placeholderMarkers.join(', ')}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-muted">
                      Configuration readiness is read on the server. This session cannot take
                      that reading, so no verdict is given.
                    </p>
                  )}
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
              <dd className="font-semibold text-text-strong">{state.finalizerMode ?? NOT_MEASURED}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted">Canary allowlist</dt>
              <dd className="font-semibold text-text-strong">
                {state.canaryAllowlistSize === null ? NOT_MEASURED : `${state.canaryAllowlistSize} submission(s)`}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted">Scheduled jobs</dt>
              <dd className="text-right font-semibold text-text-strong">not visible from the app</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted">Open integrity cases</dt>
              <dd className="font-semibold text-text-strong">
                {state.openIntegrityCases ?? NOT_MEASURED}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-subtle">
            {state.scheduledJobsNote} Open cases are listed in{' '}
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

      <Card className="p-4">
        <h2 className="mb-2 text-[15px] font-semibold text-text-strong">Activation workflow</h2>
        <p className="text-sm text-muted">
          Activating an environment is a recorded process, not a control on this page:
          readiness measured at the moment of each step, typed confirmation, approval by a
          second operator, a maintenance request, a routing instruction, smoke confirmation,
          and an immutable audit entry for every transition.
        </p>
        <ol className="mt-3 space-y-1.5 text-sm text-muted">
          {[
            'Readiness recorded',
            'Approved by a second operator',
            'Maintenance requested',
            'Routing instruction issued',
            'Smoke tests confirmed — blocked, no routing mechanism exists',
            'Completed',
          ].map((step, index) => (
            <li key={step} className="flex gap-2">
              <span className="tabular-nums text-subtle">{index + 1}.</span>
              <span className={index === 4 ? 'text-[var(--state-disputed)]' : undefined}>{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-subtle">
          A request walks as far as the routing instruction and stops there indefinitely.
          That is a truthful end state, not a failure. {ROUTING_BLOCKER} The outstanding work
          needs infrastructure, not a click. The workflow requires the{' '}
          <code>platform.environment.activate</code> capability, which is governance-only and
          is not held by Platform Admins.
        </p>
      </Card>
    </section>
  );
}
