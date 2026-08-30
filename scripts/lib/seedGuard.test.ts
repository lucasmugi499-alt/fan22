import { describe, expect, it } from 'vitest';
import { decideSeedTarget, SEED_CONFIRM_PHRASES } from './seedGuard';

/**
 * `npm run seed:firebase` wrote the whole mock database using whichever Admin credentials were
 * in the environment, with no project argument, no database argument and no confirmation. The
 * credentials in this repository's `.env.local` are real ones.
 */

const ALIASES = {
  staging: 'studio-534174814-9df36',
  demo: 'manifest-quasar-479416-s7',
  beta: 'REPLACE_WITH_BETA_PROJECT',
  production: 'REPLACE_WITH_CLEAN_PRODUCTION_PROJECT',
};

const DEMO = 'manifest-quasar-479416-s7';

describe('what a mock seed may write to', () => {
  it('refuses when no project is named', () => {
    const decision = decideSeedTarget({ aliases: ALIASES, confirm: SEED_CONFIRM_PHRASES.demo });
    expect(decision).toEqual({ ok: false, reason: expect.stringContaining('Name the project') });
  });

  it('refuses a project that is not an environment in .firebaserc', () => {
    // The failure mode: a service account for some other project sitting in the environment.
    const decision = decideSeedTarget({
      projectId: 'somebody-elses-project', aliases: ALIASES, confirm: SEED_CONFIRM_PHRASES.demo,
    });
    expect(decision).toEqual({ ok: false, reason: expect.stringContaining('not an environment in .firebaserc') });
  });

  it('refuses production outright, confirmation phrase or not', () => {
    const provisioned = { ...ALIASES, production: 'goalplace-production-real' };
    for (const confirm of [undefined, 'SEED-GOALPLACE-PRODUCTION', SEED_CONFIRM_PHRASES.demo]) {
      const decision = decideSeedTarget({
        projectId: 'goalplace-production-real', aliases: provisioned, confirm,
      });
      expect(decision).toEqual({ ok: false, reason: expect.stringContaining('never seeded into production') });
    }
  });

  it('refuses an environment whose project is still a placeholder', () => {
    const decision = decideSeedTarget({
      projectId: 'REPLACE_WITH_BETA_PROJECT', aliases: ALIASES, confirm: SEED_CONFIRM_PHRASES.beta,
    });
    expect(decision).toEqual({ ok: false, reason: expect.stringContaining('not been provisioned') });
  });

  it('refuses without the confirmation phrase, and names the phrase to type', () => {
    const decision = decideSeedTarget({ projectId: DEMO, aliases: ALIASES });
    expect(decision).toEqual({ ok: false, reason: expect.stringContaining('SEED-GOALPLACE-DEMO') });
  });

  it("refuses one environment's phrase against another environment", () => {
    const decision = decideSeedTarget({
      projectId: DEMO, aliases: ALIASES, confirm: SEED_CONFIRM_PHRASES.staging,
    });
    expect(decision.ok).toBe(false);
  });

  it('refuses the default database, which is the one nothing reads', () => {
    // seed:demo called getFirestore() with no database id, so it wrote to `(default)`. On a
    // project that HAS one, that succeeds silently into a database no surface queries.
    const decision = decideSeedTarget({
      projectId: DEMO, databaseId: '(default)', aliases: ALIASES, confirm: SEED_CONFIRM_PHRASES.demo,
    });
    expect(decision).toEqual({ ok: false, reason: expect.stringContaining('fg256') });
  });

  it('allows a named, confirmed, non-production target', () => {
    expect(decideSeedTarget({
      projectId: DEMO, aliases: ALIASES, confirm: SEED_CONFIRM_PHRASES.demo,
    })).toEqual({
      ok: true, projectId: DEMO, databaseId: 'fg256', environment: 'demo',
      label: `${DEMO}/fg256`,
    });
  });

  it('gives every seedable environment a phrase carrying its own name', () => {
    // Asserted on the parsed values rather than on the wording, so this cannot pass by
    // matching a sentence I wrote in the module beside it.
    for (const [environment, phrase] of Object.entries(SEED_CONFIRM_PHRASES)) {
      expect(phrase.toLowerCase()).toContain(environment);
    }
    expect(SEED_CONFIRM_PHRASES).not.toHaveProperty('production');
  });
});
