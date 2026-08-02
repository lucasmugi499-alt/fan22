import { describe, expect, it } from 'vitest';
import {
  applicationRateLimitId,
  buildRoleSmokeIds,
  parseArgs,
  resolveRoleSmokePlan,
  userSeed,
  validateProjectCompatibility,
} from './role-auth-firestore-smoke';

const projectMap = {
  projects: {
    staging: 'studio-534174814-9df36',
    prod: 'manifest-quasar-479416-s7',
  },
};

describe('role Auth/Firestore staging smoke helpers', () => {
  it('resolves staging config with HTTPS and the named database', () => {
    const plan = resolveRoleSmokePlan({
      baseUrl: 'https://staging.goalplace256.test/',
      databaseId: 'fg256',
      apiKey: 'api-key',
      password: 'strong-password',
      keep: false,
      allowProduction: false,
      json: false,
    }, projectMap);

    expect(plan).toMatchObject({
      baseUrl: 'https://staging.goalplace256.test',
      projectId: 'studio-534174814-9df36',
      databaseId: 'fg256',
      apiKey: 'api-key',
      keep: false,
    });
  });

  it('fails closed when required staging configuration is missing', () => {
    expect(() => resolveRoleSmokePlan({
      keep: false,
      allowProduction: false,
      json: false,
    }, {})).toThrow(/Missing staging role smoke configuration/);
  });

  it('refuses production projects unless explicitly overridden', () => {
    const options = {
      baseUrl: 'https://prod.goalplace256.test',
      projectId: 'manifest-quasar-479416-s7',
      databaseId: 'fg256',
      apiKey: 'api-key',
      password: 'strong-password',
      keep: false,
      allowProduction: false,
      json: false,
    };

    expect(() => resolveRoleSmokePlan(options, projectMap)).toThrow(/production project/);
    expect(resolveRoleSmokePlan({ ...options, allowProduction: true }, projectMap).projectId)
      .toBe('manifest-quasar-479416-s7');
  });

  it('builds separate emails for fan, organization operator, and platform identities', () => {
    const ids = buildRoleSmokeIds('Investor Role Smoke');

    expect(ids.suffix).toBe('investor_role_smoke');
    expect(ids.platformUid).toBe('smoke_platform_investor_role_smoke');
    expect(ids.existingFanEmail).not.toBe(ids.leagueOperatorEmail);
    expect(ids.leagueOperatorEmail).not.toBe(ids.teamOperatorEmail);
    expect(ids.fanInviteBlockEmail).not.toBe(ids.teamOperatorEmail);
    expect(ids.teamId).toBe('smoke_team_investor_role_smoke');
  });

  it('creates account-class-specific user seed records', () => {
    expect(userSeed('fan_1', 'fan@example.test', 'fan', 'fan')).toMatchObject({
      id: 'fan_1',
      email: 'fan@example.test',
      accountClass: 'fan',
      role: 'fan',
      primaryPersona: 'fan',
      accountStatus: 'active',
    });
    expect(userSeed('operator_1', 'operator@example.test', 'organization_operator', 'team_admin')).toMatchObject({
      accountClass: 'organization_operator',
      role: 'team_admin',
      primaryPersona: 'team_admin',
    });
  });

  it('derives the same public application rate-limit id inputs used by the API', () => {
    const first = applicationRateLimitId({
      clientIp: '10.42.1.1',
      applicantEmail: 'Applicant@Example.Test',
      leagueName: 'Smoke League',
      city: 'Kampala',
    });
    const second = applicationRateLimitId({
      clientIp: '10.42.1.1',
      applicantEmail: ' applicant@example.test ',
      leagueName: ' smoke league ',
      city: ' kampala ',
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('parses CLI flags consistently', () => {
    const parsed = parseArgs([
      '--base-url', 'https://staging.goalplace256.test',
      '--project', 'studio-534174814-9df36',
      '--database', 'fg256',
      '--api-key', 'api-key',
      '--password', 'strong-password',
      '--run-id', 'manual',
      '--keep',
      '--json',
    ]);

    expect(parsed).toMatchObject({
      baseUrl: 'https://staging.goalplace256.test',
      projectId: 'studio-534174814-9df36',
      databaseId: 'fg256',
      apiKey: 'api-key',
      password: 'strong-password',
      runId: 'manual',
      keep: true,
      json: true,
    });
  });

  it('blocks project mismatches before the hosted smoke writes data', () => {
    expect(() => validateProjectCompatibility({
      planProjectId: 'studio-534174814-9df36',
      credentialProjectId: 'manifest-quasar-479416-s7',
    })).toThrow(/credential belongs/);
    expect(() => validateProjectCompatibility({
      planProjectId: 'manifest-quasar-479416-s7',
      hostedProjectId: 'studio-534174814-9df36',
    })).toThrow(/hosted app is using/);
    expect(() => validateProjectCompatibility({
      planProjectId: 'studio-534174814-9df36',
      credentialProjectId: 'studio-534174814-9df36',
      hostedProjectId: 'studio-534174814-9df36',
    })).not.toThrow();
  });
});
