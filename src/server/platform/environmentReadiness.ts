import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Whether an environment's configuration is fit to activate.
 *
 * Shared by the Control Plane report and the activation workflow deliberately: if the page
 * that says "not ready" and the workflow that refuses to approve computed readiness
 * separately, they would eventually disagree, and an operator would be told two different
 * things about the same environment on the same console.
 */
const PLACEHOLDER_MARKERS = ['Fill with', 'REPLACE', 'TODO', 'placeholder', 'xxx'];

const CONFIG_BY_ENVIRONMENT: Record<'beta' | 'production', string> = {
  beta: 'apphosting.beta.yaml',
  production: 'apphosting.production.yaml',
};

export type EnvironmentReadiness = {
  environment: 'beta' | 'production';
  configPresent: boolean;
  placeholderMarkers: string[];
  /** Everything standing between this environment and activation, in plain words. */
  blockers: string[];
  ready: boolean;
};

export async function environmentReadiness(
  environment: 'beta' | 'production',
  routingAvailable = false,
): Promise<EnvironmentReadiness> {
  const blockers: string[] = [];
  let configPresent = false;
  let placeholderMarkers: string[] = [];

  try {
    const contents = await readFile(path.join(process.cwd(), CONFIG_BY_ENVIRONMENT[environment]), 'utf8');
    configPresent = true;
    placeholderMarkers = PLACEHOLDER_MARKERS.filter((marker) =>
      contents.toLowerCase().includes(marker.toLowerCase()));
    if (placeholderMarkers.length) {
      blockers.push(`Configuration still contains placeholder values (${placeholderMarkers.join(', ')}).`);
    }
  } catch {
    blockers.push('Configuration file is missing.');
  }

  if (!routingAvailable) {
    // Named as a blocker rather than hidden, because it is the real reason this cannot
    // finish today and an operator deserves to know that before starting.
    blockers.push('No traffic-routing mechanism exists, so traffic cannot be moved to this environment.');
  }

  return {
    environment,
    configPresent,
    placeholderMarkers,
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
