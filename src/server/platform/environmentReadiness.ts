import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROUTING_BLOCKER } from '@/lib/platform/environmentActivation';

/**
 * Whether an environment's configuration is fit to activate.
 *
 * Shared by the Control Plane report and the activation workflow deliberately: if the page
 * that says "not ready" and the workflow that refuses to approve computed readiness
 * separately, they would eventually disagree, and an operator would be told two different
 * things about the same environment on the same console.
 *
 * Readiness is reported as two lists rather than one, because the two kinds of blocker have
 * to be enforced at different points. Configuration faults are ours to fix and must stop an
 * approval. The absent routing mechanism is infrastructure that no approval can conjure, and
 * gating approval on it would wall the workflow in at `readiness_checked` — the operator
 * could never record the maintenance window or the routing instruction that the process
 * exists to capture. It is enforced instead at the step where it actually bites: smoke
 * confirmation, which would otherwise record that traffic moved when nothing can move it.
 */
const PLACEHOLDER_MARKERS = ['Fill with', 'REPLACE', 'TODO', 'placeholder', 'xxx'];

const CONFIG_BY_ENVIRONMENT: Record<'beta' | 'production', string> = {
  beta: 'apphosting.beta.yaml',
  production: 'apphosting.production.yaml',
};

export { ROUTING_BLOCKER };

export type EnvironmentReadiness = {
  environment: 'beta' | 'production';
  configPresent: boolean;
  placeholderMarkers: string[];
  /**
   * Faults in this environment's own configuration. These gate approval: approving an
   * environment whose config is still placeholders is approving something nobody checked.
   */
  configBlockers: string[];
  /** Whether this deployment can retarget traffic at all. Today: never. */
  routingAvailable: boolean;
  /**
   * Everything standing between this environment and activation, in plain words —
   * configuration faults plus the routing wall. This is the reporting list, and the list
   * recorded in the audit trail. It is NOT the list approval is gated on.
   */
  blockers: string[];
  ready: boolean;
};

export async function environmentReadiness(
  environment: 'beta' | 'production',
  routingAvailable = false,
): Promise<EnvironmentReadiness> {
  const configBlockers: string[] = [];
  let configPresent = false;
  let placeholderMarkers: string[] = [];

  try {
    // turbopackIgnore stops the tracer following process.cwd() and pulling the entire
    // project into the route's file trace. The two files this can reach are named in
    // outputFileTracingIncludes instead, so they still ship with the server.
    const configPath = path.join(/* turbopackIgnore: true */ process.cwd(), CONFIG_BY_ENVIRONMENT[environment]);
    const contents = await readFile(configPath, 'utf8');
    configPresent = true;
    placeholderMarkers = PLACEHOLDER_MARKERS.filter((marker) =>
      contents.toLowerCase().includes(marker.toLowerCase()));
    if (placeholderMarkers.length) {
      configBlockers.push(`Configuration still contains placeholder values (${placeholderMarkers.join(', ')}).`);
    }
  } catch {
    configBlockers.push('Configuration file is missing.');
  }

  const blockers = [...configBlockers];
  if (!routingAvailable) {
    // Named as a blocker rather than hidden, because it is the real reason this cannot
    // finish today and an operator deserves to know that before starting.
    blockers.push(ROUTING_BLOCKER);
  }

  return {
    environment,
    configPresent,
    placeholderMarkers,
    configBlockers,
    routingAvailable,
    blockers,
    ready: blockers.length === 0,
  };
}

/**
 * Whether this deployment can actually retarget traffic.
 *
 * Hardcoded false, and that is the honest answer: App Hosting serves one backend here and
 * nothing in this codebase can point it elsewhere. When a gateway or DNS control exists,
 * this becomes a real check against it — not a constant flipped to true.
 */
export function routingMechanismAvailable() {
  return false;
}
