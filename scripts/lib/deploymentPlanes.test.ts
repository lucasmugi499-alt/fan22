import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The two runtimes that can rebuild an access projection must agree about the sunset stage.
 *
 * `GOALPLACE_TEAM_AUTHORITY_STAGE` is not a display setting. It decides what a team bundle
 * grants at the moment a projection is BUILT, and two different runtimes build projections:
 * the Next server does it in `src/server/access/projector.ts` whenever an assignment changes,
 * and `convergeLifecycle` does it hourly in `functions/src/lifecycle.ts`.
 *
 * If one says `retired` and the other still says `frozen`, the migration undoes itself. The
 * runtime on the old stage computes a desired projection that still carries team
 * capabilities, finds it disagrees with the retired document, and writes the capabilities
 * back — one user at a time, invisibly. `access:sunset-invariants` passes on the day it is
 * run and fails a week later with nothing having changed.
 *
 * An unset variable falls back to `frozen`, so an ABSENT declaration is a disagreement too,
 * which is why this asserts both files declare it rather than only comparing what they say.
 */

const APPHOSTING = 'apphosting.yaml';
const FUNCTIONS_ENV = 'functions/.env.manifest-quasar-479416-s7';
const VARIABLE = 'GOALPLACE_TEAM_AUTHORITY_STAGE';

function appHostingValue(variable: string): string | undefined {
  const yaml = readFileSync(APPHOSTING, 'utf8');
  // Deliberately a narrow regex rather than a YAML parser: this test must fail on a
  // malformed entry, not silently parse around it.
  const match = yaml.match(
    new RegExp(`-\\s*variable:\\s*${variable}\\s*\\n\\s*value:\\s*"?([a-z_]+)"?`),
  );
  return match?.[1];
}

function functionsEnvValue(variable: string): string | undefined {
  const env = readFileSync(FUNCTIONS_ENV, 'utf8');
  const match = env.match(new RegExp(`^${variable}=(.*)$`, 'm'));
  return match?.[1].trim();
}

describe('team authority stage across deployment planes', () => {
  it('is declared in both runtimes', () => {
    // Absence is not neutral. Unset resolves to `frozen`, so a missing declaration is the
    // same failure as an explicit disagreement, and harder to notice.
    expect(appHostingValue(VARIABLE), `${VARIABLE} missing from ${APPHOSTING}`).toBeDefined();
    expect(functionsEnvValue(VARIABLE), `${VARIABLE} missing from ${FUNCTIONS_ENV}`).toBeDefined();
  });

  it('says the same thing in both', () => {
    expect(appHostingValue(VARIABLE)).toBe(functionsEnvValue(VARIABLE));
  });

  it('declares a stage the code recognises', () => {
    // A typo resolves to `frozen` at runtime with no error anywhere, which would read as a
    // successful deploy that silently un-retired team authority.
    expect(['active', 'frozen', 'retired']).toContain(functionsEnvValue(VARIABLE));
  });
});

/**
 * Field capture and the bilateral V1 path must NOT share a switch.
 *
 * The inverse of the test above, and it is not a contradiction: the sunset stage describes one
 * migration and has to be identical everywhere, while the finalizer gates describe three
 * independently maturing pipelines and must be separately settable. What is asserted here is
 * that the field capture gate exists as its own variable at all — collapsing it back into
 * `GOALPLACE_FINALIZER_MODE` is what armed an unproven pipeline the first time.
 */
/**
 * Every App Hosting config that could be the one a backend reads must agree.
 *
 * `apphosting.yaml` is the base, and `apphosting.<environment>.yaml` overrides it when a
 * backend is built with an environment name. Which of the two a given backend uses is not
 * visible from the CLI, so "I set it in apphosting.yaml" is not by itself a statement about
 * what the runtime received.
 *
 * The demo overlay exists and had no `GOALPLACE_TEAM_AUTHORITY_STAGE` at all. If that file is
 * the one in force, the App Hosting runtime falls back to `frozen` while the Functions
 * runtime says `retired` — the exact split this whole test file exists to catch, hidden one
 * level further down than the first check looks.
 *
 * Rather than guess which file wins, both declare it and both must say the same thing.
 */
describe('team authority stage across App Hosting config files', () => {
  // All three, not just demo. Beta and production used to declare no stage at all and
  // inherited whatever the base said — so the base being correct today was the only thing
  // standing between a promoted environment and a re-opened team authority model. An
  // inherited safety floor is one nobody can read off the file they are reviewing.
  const OVERLAYS = ['apphosting.demo.yaml', 'apphosting.beta.yaml', 'apphosting.production.yaml'];

  it.each(OVERLAYS)('%s declares the same stage as apphosting.yaml', (overlay) => {
    const base = appHostingValue(VARIABLE);
    const yaml = readFileSync(overlay, 'utf8');
    const match = yaml.match(
      new RegExp(`-\\s*variable:\\s*${VARIABLE}\\s*\\n\\s*value:\\s*"?([a-z_]+)"?`),
    );
    expect(match?.[1], `${VARIABLE} missing from ${overlay}`).toBeDefined();
    expect(match?.[1]).toBe(base);
  });
});

/**
 * The un-overlaid base must not be deployable, and must not name a project.
 *
 * `apphosting.yaml` was a copy of the demo configuration. App Hosting reads it whenever a
 * backend names no overlay, so a backend created for beta and given no overlay came up as
 * demo and wrote to the demo database — no mistake in the beta config required, only a
 * forgotten flag. This is one of the two independent paths by which beta work could reach
 * the investor demo; `firestoreTarget.test.ts` covers the other.
 *
 * Asserted structurally rather than by reading the environment, because the failure this
 * prevents happens at backend-creation time on somebody else's machine.
 */
describe('the un-overlaid apphosting.yaml refuses to be an environment', () => {
  const base = readFileSync(APPHOSTING, 'utf8');

  it('declares the unconfigured sentinel that the build gate rejects', () => {
    expect(appHostingValue('GOALPLACE_ENVIRONMENT')).toBe('unconfigured');
  });

  it('names no Firebase project, in any variable', () => {
    // Substring, not an exact variable match: the demo project id appeared in
    // GOALPLACE_ADMIN_PROJECT_ID, NEXT_PUBLIC_FIREBASE_PROJECT_ID, the auth domain, the
    // storage bucket and the base URL. Any one of them reaching this file resurrects it.
    expect(base).not.toContain('manifest-quasar');
    expect(base).not.toContain('studio-534174814');
    expect(base).not.toMatch(/PROJECT_ID\s*\n\s*value:/);
  });

  it('leaves every permissive flag off, so an overlay that forgets one inherits the strict answer', () => {
    for (const variable of [
      'GOALPLACE_ALLOW_DEMO_LOGIN',
      'NEXT_PUBLIC_ENABLE_DEMO_LOGIN',
      'GOALPLACE_ALLOW_SEEDING',
      'GOALPLACE_ALLOW_REAL_PAYMENTS',
      'GOALPLACE_ENABLE_INVESTOR_TOOLS',
    ]) {
      const match = base.match(
        new RegExp(`-\\s*variable:\\s*${variable}\\s*\\n\\s*value:\\s*"?([a-z]+)"?`),
      );
      expect(match?.[1], `${variable} missing from ${APPHOSTING}`).toBe('false');
    }
    const appCheck = base.match(
      /-\s*variable:\s*GOALPLACE_REQUIRE_APP_CHECK\s*\n\s*value:\s*"?([a-z]+)"?/,
    );
    expect(appCheck?.[1]).toBe('true');
  });

  it('leaves every finalization pipeline off, so no environment inherits an unproven activation', () => {
    for (const variable of [
      'GOALPLACE_FINALIZER_MODE',
      'GOALPLACE_FIELD_CAPTURE_MODE',
      'GOALPLACE_LEAGUE_ENTRY_MODE',
    ]) {
      expect(appHostingValue(variable), `${variable} missing from ${APPHOSTING}`).toBe('off');
    }
  });
});

describe('finalizer gates on the Functions plane', () => {
  it('gives field capture its own declared mode', () => {
    expect(functionsEnvValue('GOALPLACE_FIELD_CAPTURE_MODE')).toBeDefined();
    expect(['off', 'canary', 'enabled']).toContain(functionsEnvValue('GOALPLACE_FIELD_CAPTURE_MODE'));
  });

  it('keeps the legacy mode separate from it', () => {
    expect(functionsEnvValue('GOALPLACE_FINALIZER_MODE')).toBeDefined();
  });

  it('leaves the field capture canary allowlist declared, even when empty', () => {
    // Populated-empty on purpose: narrowing to one fixture is then a one-line change rather
    // than a new variable somebody has to remember the exact name of under pressure.
    expect(functionsEnvValue('GOALPLACE_FIELD_CAPTURE_CANARY_MATCH_IDS')).toBeDefined();
  });
});
