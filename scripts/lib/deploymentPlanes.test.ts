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
