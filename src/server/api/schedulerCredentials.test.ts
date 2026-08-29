import { describe, expect, it } from 'vitest';
import { schedulerAuthDiagnostics, schedulerCredentialStatus } from './security';

/**
 * A declared auth mode with no credential behind it must be loud.
 *
 * `safeSecretEquals` returns false when the expected value is undefined — correct, and the
 * reason a missing secret can never authorize anything. The cost is that a route whose
 * credential was never declared answers 401 to every caller forever and is indistinguishable
 * from somebody probing the endpoint with a wrong secret. The Cloud Function logs the 401 and
 * moves on, so scheduled work simply does not happen and nothing surfaces it to a human.
 *
 * `GOALPLACE_RECONCILIATION_SECRET` is in exactly that state today: `functions/src/index.ts`
 * declares it with `defineSecret` on the CALLING side, and no App Hosting overlay declares it
 * on the RECEIVING side. Half a shared credential. `reconcilePaymentIntents` is deliberately
 * undeployed, so nothing is broken by it right now — which is why it would have gone
 * unnoticed until the day that function was switched on.
 */

const SHARED_SECRET_MODE = { GOALPLACE_SCHEDULER_AUTH_MODE: 'shared_secret' } as NodeJS.ProcessEnv;

const RECONCILIATION = {
  operation: 'payment_reconciliation',
  legacySecretHeader: 'x-goalplace-reconciliation-secret',
  legacySecretEnv: 'GOALPLACE_RECONCILIATION_SECRET',
};

const FANTASY = {
  operation: 'fantasy_lineup_lock',
  legacySecretHeader: 'x-goalplace-fantasy-secret',
  legacySecretEnv: 'GOALPLACE_FANTASY_SCORING_SECRET',
};

describe('shared-secret scheduler routes', () => {
  it('reports a route whose secret was never declared as unconfigured', () => {
    expect(schedulerCredentialStatus(RECONCILIATION, SHARED_SECRET_MODE)).toMatchObject({
      mode: 'shared_secret',
      credentialVariable: 'GOALPLACE_RECONCILIATION_SECRET',
      configured: false,
    });
  });

  it('reports a route whose secret is present as configured', () => {
    expect(schedulerCredentialStatus(FANTASY, {
      ...SHARED_SECRET_MODE,
      GOALPLACE_FANTASY_SCORING_SECRET: 'a-real-value',
    } as NodeJS.ProcessEnv).configured).toBe(true);
  });

  it('names the variable that is missing, not just that something is', () => {
    // The whole failure is that nobody knew WHICH credential was absent.
    expect(schedulerCredentialStatus(RECONCILIATION, SHARED_SECRET_MODE).credentialVariable)
      .toBe('GOALPLACE_RECONCILIATION_SECRET');
  });

  it('defaults to shared secret when no mode is declared, matching the runtime', () => {
    expect(schedulerCredentialStatus(RECONCILIATION, {} as NodeJS.ProcessEnv).mode)
      .toBe('shared_secret');
  });
});

describe('OIDC scheduler routes', () => {
  const oidc = { GOALPLACE_SCHEDULER_AUTH_MODE: 'oidc' } as NodeJS.ProcessEnv;

  it('treats an empty service account allowlist as unconfigured', () => {
    // `verifySchedulerOidc` returns false on an empty allowlist, which is the same
    // permanent-401 shape as an undeclared secret and deserves the same diagnosis.
    expect(schedulerCredentialStatus(RECONCILIATION, oidc)).toMatchObject({
      mode: 'oidc',
      credentialVariable: 'GOALPLACE_SCHEDULER_SERVICE_ACCOUNT_EMAILS',
      configured: false,
    });
  });

  it('treats an unfilled REPLACE_WITH_ placeholder as unconfigured', () => {
    // Beta and production ship this variable as a placeholder. A placeholder is a string,
    // so a naive presence check would call it configured and the route would 401 forever.
    expect(schedulerCredentialStatus(RECONCILIATION, {
      ...oidc,
      GOALPLACE_SCHEDULER_SERVICE_ACCOUNT_EMAILS: 'REPLACE_WITH_BETA_SCHEDULER_SERVICE_ACCOUNT',
    } as NodeJS.ProcessEnv).configured).toBe(false);
  });

  it('accepts a real service account allowlist', () => {
    expect(schedulerCredentialStatus(RECONCILIATION, {
      ...oidc,
      GOALPLACE_SCHEDULER_SERVICE_ACCOUNT_EMAILS: 'jobs@goalplace-beta.iam.gserviceaccount.com',
    } as NodeJS.ProcessEnv).configured).toBe(true);
  });
});

describe('the diagnostics reported by /api/environment', () => {
  it('lists every unconfigured route so the gap is readable off a running deployment', () => {
    const diagnostics = schedulerAuthDiagnostics({
      ...SHARED_SECRET_MODE,
      GOALPLACE_FANTASY_SCORING_SECRET: 'a-real-value',
    } as NodeJS.ProcessEnv);

    // The demo configuration exactly: fantasy has its Secret Manager reference, payment
    // reconciliation does not.
    expect(diagnostics.unconfigured).toEqual([
      { operation: 'payment_reconciliation', missingVariable: 'GOALPLACE_RECONCILIATION_SECRET' },
    ]);
  });

  it('reports nothing unconfigured once every credential is declared', () => {
    expect(schedulerAuthDiagnostics({
      ...SHARED_SECRET_MODE,
      GOALPLACE_FANTASY_SCORING_SECRET: 'a-real-value',
      GOALPLACE_RECONCILIATION_SECRET: 'another-real-value',
    } as NodeJS.ProcessEnv).unconfigured).toEqual([]);
  });

  it('exposes no secret material, because the endpoint is public', () => {
    const serialized = JSON.stringify(schedulerAuthDiagnostics({
      ...SHARED_SECRET_MODE,
      GOALPLACE_FANTASY_SCORING_SECRET: 'super-secret-value',
      GOALPLACE_RECONCILIATION_SECRET: 'another-secret-value',
    } as NodeJS.ProcessEnv));
    expect(serialized).not.toContain('super-secret-value');
    expect(serialized).not.toContain('another-secret-value');
  });
});
