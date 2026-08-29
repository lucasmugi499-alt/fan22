import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assertDeployTarget,
  registeredProjectId,
  resolveProjectAlias,
} from './deployTarget';

/**
 * The failure this file exists to prevent, stated once:
 *
 * `deploy:prod:candidate-after-approval` passed `--project manifest-quasar-479416-s7`, the
 * DEMO project. An operator running the production rules promotion deployed
 * `firestore.rules.next` to demo and had no way to tell — all three environments share the
 * database id `fg256`, so the wrong project resolves to a database that exists under the
 * expected name instead of erroring.
 *
 * Fixtures are written to a temp root rather than reading the repo's own `.firebaserc`,
 * because the interesting cases are a FULLY PROVISIONED beta and production, which the repo
 * does not have yet. Asserting against the repo would only ever exercise the placeholder
 * path and would go quiet at exactly the moment the guard starts to matter.
 */

let root: string;

const FIREBASERC = {
  projects: {
    staging: 'studio-534174814-9df36',
    demo: 'manifest-quasar-479416-s7',
    beta: 'goalplace-beta',
    production: 'goalplace-prod',
  },
};

const REGISTRY = {
  environments: {
    demo: {
      firebaseProjectId: 'manifest-quasar-479416-s7',
      firestoreDatabaseId: 'fg256',
      appHostingConfig: 'apphosting.demo.yaml',
    },
    beta: {
      firebaseProjectId: 'goalplace-beta',
      firestoreDatabaseId: 'fg256',
      appHostingConfig: 'apphosting.beta.yaml',
    },
    production: {
      firebaseProjectId: 'goalplace-prod',
      firestoreDatabaseId: 'fg256',
      appHostingConfig: 'apphosting.production.yaml',
    },
  },
};

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'goalplace-deploy-target-'));
  writeFileSync(path.join(root, '.firebaserc'), JSON.stringify(FIREBASERC));
  mkdirSync(path.join(root, 'config'), { recursive: true });
  writeFileSync(path.join(root, 'config', 'environments.json'), JSON.stringify(REGISTRY));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('resolving what a deploy is about to write to', () => {
  it('expands a .firebaserc alias to its project id', () => {
    expect(resolveProjectAlias('production', root)).toBe('goalplace-prod');
  });

  it('passes an unaliased raw project id through unchanged', () => {
    // Legal usage. The environment cross-check below is what catches a wrong raw id.
    expect(resolveProjectAlias('some-other-project', root)).toBe('some-other-project');
  });

  it('reads the project an environment is registered to own', () => {
    expect(registeredProjectId('beta', root)).toBe('goalplace-beta');
  });
});

describe('the deploy target preflight', () => {
  it('allows a production deploy that resolves to the production project', () => {
    const target = assertDeployTarget({
      environment: 'production',
      requestedProject: 'production',
      root,
    });
    expect(target.projectId).toBe('goalplace-prod');
    expect(target.label).toBe('goalplace-prod/fg256');
  });

  /**
   * The historical bug, verbatim: the script named for production, carrying the demo id.
   */
  it('refuses a production deploy pointed at the demo project', () => {
    expect(() => assertDeployTarget({
      environment: 'production',
      requestedProject: 'manifest-quasar-479416-s7',
      root,
    })).toThrow(/registered to project 'goalplace-prod'/);
  });

  it('names both projects in the refusal, because a wrong id reads as plausible on its own', () => {
    expect(() => assertDeployTarget({
      environment: 'production',
      requestedProject: 'manifest-quasar-479416-s7',
      root,
    })).toThrow(/manifest-quasar-479416-s7/);
  });

  it('says that the shared database id is why the mistake is quiet', () => {
    // The operator needs to know the deploy would have SUCCEEDED against a real database,
    // not failed on a missing one. Otherwise "it errored" reads as a transient problem.
    expect(() => assertDeployTarget({
      environment: 'production',
      requestedProject: 'demo',
      root,
    })).toThrow(/share the database id 'fg256'/);
  });

  it('refuses a beta deploy pointed at production, in the other direction too', () => {
    expect(() => assertDeployTarget({
      environment: 'beta',
      requestedProject: 'production',
      root,
    })).toThrow(/'beta' is registered to project 'goalplace-beta'/);
  });

  it('reports the alias alongside the id it resolved to', () => {
    const target = assertDeployTarget({
      environment: 'demo',
      requestedProject: 'demo',
      root,
    });
    expect(target.requestedProject).toBe('demo');
    expect(target.projectId).toBe('manifest-quasar-479416-s7');
  });
});

describe('an environment that has not been provisioned', () => {
  let placeholderRoot: string;

  beforeAll(() => {
    placeholderRoot = mkdtempSync(path.join(tmpdir(), 'goalplace-deploy-placeholder-'));
    mkdirSync(path.join(placeholderRoot, 'config'), { recursive: true });
    writeFileSync(path.join(placeholderRoot, '.firebaserc'), JSON.stringify({
      projects: {
        demo: 'manifest-quasar-479416-s7',
        production: 'REPLACE_WITH_CLEAN_PRODUCTION_PROJECT',
      },
    }));
    writeFileSync(path.join(placeholderRoot, 'config', 'environments.json'), JSON.stringify({
      environments: {
        demo: REGISTRY.environments.demo,
        production: {
          firebaseProjectId: 'REPLACE_WITH_CLEAN_PRODUCTION_PROJECT',
          firestoreDatabaseId: 'fg256',
          appHostingConfig: 'apphosting.production.yaml',
        },
      },
    }));
  });

  afterAll(() => rmSync(placeholderRoot, { recursive: true, force: true }));

  it('reports a placeholder as not provisioned rather than comparing it', () => {
    // Comparing placeholders would let REPLACE_WITH_… match itself and wave through a
    // deploy to a project that does not exist.
    expect(registeredProjectId('production', placeholderRoot)).toBeUndefined();
  });

  it('refuses the deploy and says the project was never created', () => {
    expect(() => assertDeployTarget({
      environment: 'production',
      requestedProject: 'production',
      root: placeholderRoot,
    })).toThrow(/has not been provisioned/);
  });

  it('refuses even when a real-looking project id is supplied for an unprovisioned environment', () => {
    // This is today's state exactly: production is a placeholder, so there is nothing to
    // check a supplied id against. Refusing beats guessing.
    expect(() => assertDeployTarget({
      environment: 'production',
      requestedProject: 'manifest-quasar-479416-s7',
      root: placeholderRoot,
    })).toThrow(/still carries a REPLACE_WITH_ placeholder/);
  });

  it('leaves demo deployable while production is unprovisioned', () => {
    expect(assertDeployTarget({
      environment: 'demo',
      requestedProject: 'demo',
      root: placeholderRoot,
    }).projectId).toBe('manifest-quasar-479416-s7');
  });
});
