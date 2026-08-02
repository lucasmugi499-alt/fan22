import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { applicationDefault, cert, deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { accessIndexId } from '../../src/lib/auth/access';

type ProjectMap = {
  projects?: Record<string, string>;
};

type CliOptions = {
  baseUrl?: string;
  projectId?: string;
  databaseId?: string;
  apiKey?: string;
  password?: string;
  runId?: string;
  keep: boolean;
  allowProduction: boolean;
  json: boolean;
};

export type RoleSmokePlan = {
  baseUrl: string;
  projectId: string;
  databaseId: string;
  apiKey: string;
  password: string;
  runId: string;
  keep: boolean;
  allowProduction: boolean;
  json: boolean;
};

export type RoleSmokeIds = {
  suffix: string;
  platformUid: string;
  platformEmail: string;
  existingFanUid: string;
  existingFanEmail: string;
  leagueOperatorUid: string;
  leagueOperatorEmail: string;
  fanInviteBlockUid: string;
  fanInviteBlockEmail: string;
  teamOperatorUid: string;
  teamOperatorEmail: string;
  leagueName: string;
  blockedLeagueName: string;
  teamId: string;
};

type ApiStep = {
  name: string;
  status: number;
  ok: boolean;
  body: unknown;
};

type CreatedIds = {
  blockedApplicationId?: string;
  approvedApplicationId?: string;
  organizationId?: string;
  leagueId?: string;
  seasonId?: string;
  leagueInvitationId?: string;
  leagueInvitationToken?: string;
  fanBlockedInvitationId?: string;
  fanBlockedInvitationToken?: string;
  teamInvitationId?: string;
  teamInvitationToken?: string;
};

type SmokeReport = {
  runId: string;
  projectId: string;
  databaseId: string;
  baseUrl: string;
  startedAt: string;
  completedAt: string;
  ids: RoleSmokeIds;
  created: CreatedIds;
  steps: ApiStep[];
  assertions: Record<string, unknown>;
  cleanup: {
    attempted: boolean;
    skipped: boolean;
    deletedDocuments: number;
    deletedUsers: string[];
  };
};

type IdentityToolkitResponse = {
  idToken?: string;
  error?: { message?: string };
};

type ApplicationResponse = {
  id: string;
};

type ApprovalResponse = {
  ok: true;
  leagueId: string;
  organizationId: string;
  invitationId: string;
  actionUrl: string;
};

type AcceptInvitationResponse = {
  ok: true;
  role?: string;
  scopeId: string;
};

type CreateTeamsResponse = {
  ok: true;
  id: string;
  count: number;
};

type TeamInvitationResponse = {
  ok: true;
  id: string;
  token: string;
  actionUrl: string;
};

type AccessContextResponse = {
  userId: string;
  accountClass: string;
  accountRole: string | null;
  primaryPersona: string | null;
  indexes: Array<{
    scopeType: string;
    scopeId: string;
    activeRoles: string[];
    capabilities: string[];
  }>;
};

const DEFAULT_DATABASE_ID = 'fg256';
const REPORT_DIR = path.join(process.cwd(), 'reports', 'staging');
const PROD_PROJECT_PATTERN = /manifest-quasar-479416-s7|prod/i;

export function parseArgs(argv: string[]): CliOptions {
  return {
    baseUrl: valueAfter(argv, '--base-url') ?? process.env.GOALPLACE_STAGING_BASE_URL,
    projectId:
      valueAfter(argv, '--project') ??
      process.env.GOALPLACE_STAGING_PROJECT_ID ??
      process.env.GOALPLACE_ADMIN_PROJECT_ID ??
      process.env.FIREBASE_ADMIN_PROJECT_ID,
    databaseId:
      valueAfter(argv, '--database') ??
      process.env.GOALPLACE_FIRESTORE_DATABASE_ID ??
      process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID ??
      DEFAULT_DATABASE_ID,
    apiKey:
      valueAfter(argv, '--api-key') ??
      process.env.GOALPLACE_STAGING_FIREBASE_API_KEY ??
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    password:
      valueAfter(argv, '--password') ??
      process.env.GOALPLACE_STAGING_SMOKE_PASSWORD ??
      process.env.FIREBASE_DEMO_PASSWORD ??
      process.env.NEXT_PUBLIC_FIREBASE_DEMO_PASSWORD,
    runId: valueAfter(argv, '--run-id'),
    keep: argv.includes('--keep') || argv.includes('--no-cleanup'),
    allowProduction: argv.includes('--allow-production'),
    json: argv.includes('--json'),
  };
}

export function readProjectMap(file = path.join(process.cwd(), '.firebaserc')): ProjectMap {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ProjectMap;
}

export function resolveRoleSmokePlan(options: CliOptions, projectMap = readProjectMap()): RoleSmokePlan {
  const projectId = options.projectId ?? projectMap.projects?.staging;
  const missing: string[] = [];
  if (!options.baseUrl) missing.push('GOALPLACE_STAGING_BASE_URL or --base-url');
  if (!projectId) missing.push('GOALPLACE_STAGING_PROJECT_ID, --project, or .firebaserc projects.staging');
  if (!options.databaseId) missing.push('GOALPLACE_FIRESTORE_DATABASE_ID, NEXT_PUBLIC_FIREBASE_DATABASE_ID, or --database');
  if (!options.apiKey) missing.push('GOALPLACE_STAGING_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_API_KEY, or --api-key');
  if (!options.password) missing.push('GOALPLACE_STAGING_SMOKE_PASSWORD, FIREBASE_DEMO_PASSWORD, or --password');
  if (missing.length) {
    throw new Error(`Missing staging role smoke configuration: ${missing.join(', ')}.`);
  }
  const baseUrl = normalizeBaseUrl(options.baseUrl!);
  if (options.databaseId !== DEFAULT_DATABASE_ID) {
    throw new Error(`Refusing database "${options.databaseId}". This smoke test is scoped to "${DEFAULT_DATABASE_ID}".`);
  }
  if (!options.allowProduction && isProductionProject(projectId!, projectMap)) {
    throw new Error(`Refusing to run role staging smoke against production project "${projectId}".`);
  }
  if (options.password!.length < 8) {
    throw new Error('The smoke account password must be at least 8 characters.');
  }
  return {
    baseUrl,
    projectId: projectId!,
    databaseId: options.databaseId,
    apiKey: options.apiKey!,
    password: options.password!,
    runId: normalizeRunId(options.runId ?? `role_${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}_${randomUUID().slice(0, 8)}`),
    keep: options.keep,
    allowProduction: options.allowProduction,
    json: options.json,
  };
}

export function buildRoleSmokeIds(runId: string): RoleSmokeIds {
  const suffix = normalizeRunId(runId);
  return {
    suffix,
    platformUid: `smoke_platform_${suffix}`,
    platformEmail: `platform-smoke-${suffix.slice(0, 36)}@goalplace256.test`,
    existingFanUid: `smoke_existing_fan_${suffix}`,
    existingFanEmail: `existing-fan-${suffix.slice(0, 36)}@goalplace256.test`,
    leagueOperatorUid: `smoke_league_operator_${suffix}`,
    leagueOperatorEmail: `league-operator-${suffix.slice(0, 36)}@goalplace256.test`,
    fanInviteBlockUid: `smoke_fan_invite_block_${suffix}`,
    fanInviteBlockEmail: `fan-invite-block-${suffix.slice(0, 36)}@goalplace256.test`,
    teamOperatorUid: `smoke_team_operator_${suffix}`,
    teamOperatorEmail: `team-operator-${suffix.slice(0, 36)}@goalplace256.test`,
    leagueName: `Smoke Rugby League ${suffix}`,
    blockedLeagueName: `Blocked Fan Email League ${suffix}`,
    teamId: `smoke_team_${suffix}`,
  };
}

export function applicationRateLimitId(input: {
  clientIp: string;
  appId?: string;
  applicantEmail: string;
  leagueName: string;
  city: string;
}) {
  const duplicateKey = [
    input.applicantEmail.trim().toLowerCase(),
    input.leagueName.trim().toLowerCase(),
    input.city.trim().toLowerCase(),
  ].join(':');
  return sha256([
    'league-admin-applications',
    input.clientIp,
    input.appId ?? 'unverified-app',
    duplicateKey,
  ].filter(Boolean).join(':'));
}

export function userSeed(uid: string, email: string, accountClass: 'fan' | 'organization_operator' | 'platform_operator', role: string) {
  const now = new Date().toISOString();
  return {
    id: uid,
    uid,
    email,
    name: `Smoke ${role}`,
    role,
    accountClass,
    primaryPersona: role,
    accountStatus: 'active',
    status: 'active',
    accessVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function validateProjectCompatibility(input: {
  planProjectId: string;
  hostedProjectId?: string;
  credentialProjectId?: string;
}) {
  if (input.credentialProjectId && input.credentialProjectId !== input.planProjectId) {
    throw new Error(
      `The Admin SDK credential belongs to "${input.credentialProjectId}", but this smoke is targeting "${input.planProjectId}".`,
    );
  }
  if (input.hostedProjectId && input.hostedProjectId !== input.planProjectId) {
    throw new Error(
      `The hosted app is using Firebase project "${input.hostedProjectId}", but this smoke is targeting "${input.planProjectId}".`,
    );
  }
}

async function run() {
  const plan = resolveRoleSmokePlan(parseArgs(process.argv.slice(2)));
  const ids = buildRoleSmokeIds(plan.runId);
  await assertProjectCompatibility(plan);
  const app = createAdminApp(plan);
  const auth = getAuth(app);
  const db = getFirestore(app, plan.databaseId);
  const steps: ApiStep[] = [];
  const created: CreatedIds = {};
  const assertions: Record<string, unknown> = {};
  const cleanup = {
    attempted: false,
    skipped: plan.keep,
    deletedDocuments: 0,
    deletedUsers: [] as string[],
  };
  const startedAt = new Date().toISOString();
  const clientIp = syntheticClientIp(ids.suffix);

  try {
    await createAuthUserWithProfile({
      auth,
      db,
      uid: ids.platformUid,
      email: ids.platformEmail,
      password: plan.password,
      accountClass: 'platform_operator',
      role: 'platform_admin',
      claims: { role: 'platform_admin', accountClass: 'platform_operator' },
    });
    await createAuthUserWithProfile({
      auth,
      db,
      uid: ids.existingFanUid,
      email: ids.existingFanEmail,
      password: plan.password,
      accountClass: 'fan',
      role: 'fan',
      claims: { role: 'fan', accountClass: 'fan' },
    });

    const platformToken = await signInWithPassword(plan, ids.platformEmail);
    const blockedApplication = await callApi<ApplicationResponse>(plan, steps, {
      name: 'public_application_existing_fan_email',
      path: '/api/league-admin-applications',
      body: leagueApplicationBody({
        applicantEmail: ids.existingFanEmail,
        leagueName: ids.blockedLeagueName,
      }),
      forwardedFor: clientIp,
      expectedStatus: 201,
    });
    created.blockedApplicationId = blockedApplication.id;
    await callApi(plan, steps, {
      name: 'reject_approval_for_existing_fan_email',
      path: '/api/access',
      bearerToken: platformToken,
      body: { action: 'approve_league_admin', applicationId: blockedApplication.id },
      expectedStatus: 409,
    });

    const approvedApplication = await callApi<ApplicationResponse>(plan, steps, {
      name: 'public_application_operator_email',
      path: '/api/league-admin-applications',
      body: leagueApplicationBody({
        applicantEmail: ids.leagueOperatorEmail,
        leagueName: ids.leagueName,
      }),
      forwardedFor: clientIp,
      expectedStatus: 201,
    });
    created.approvedApplicationId = approvedApplication.id;

    const approval = await callApi<ApprovalResponse>(plan, steps, {
      name: 'platform_approves_league_application',
      path: '/api/access',
      bearerToken: platformToken,
      body: { action: 'approve_league_admin', applicationId: approvedApplication.id },
      expectedStatus: 200,
    });
    created.organizationId = approval.organizationId;
    created.leagueId = approval.leagueId;
    created.leagueInvitationId = approval.invitationId;
    created.leagueInvitationToken = tokenFromActionUrl(approval.actionUrl);
    const seasonSnapshot = await db.collection('leagues').doc(approval.leagueId).get();
    created.seasonId = String(seasonSnapshot.data()?.currentSeasonId ?? '');

    await createAuthUserWithProfile({
      auth,
      db,
      uid: ids.leagueOperatorUid,
      email: ids.leagueOperatorEmail,
      password: plan.password,
      accountClass: 'organization_operator',
      role: 'team_admin',
      claims: { accountClass: 'organization_operator' },
    });
    const leagueOperatorToken = await signInWithPassword(plan, ids.leagueOperatorEmail);
    const acceptedLeague = await callApi<AcceptInvitationResponse>(plan, steps, {
      name: 'operator_accepts_league_owner_invitation',
      path: '/api/access',
      bearerToken: leagueOperatorToken,
      body: {
        action: 'accept_invitation',
        invitationId: approval.invitationId,
        token: created.leagueInvitationToken,
      },
      expectedStatus: 200,
    });
    assertEqual(acceptedLeague.role, 'league_admin', 'accepted league invitation role');
    assertEqual(acceptedLeague.scopeId, approval.leagueId, 'accepted league invitation scope');
    await assertDocFields(db, 'users', ids.existingFanUid, { accountClass: 'fan', role: 'fan' });
    await assertDocFields(db, 'users', ids.leagueOperatorUid, {
      accountClass: 'organization_operator',
      role: 'league_admin',
      primaryPersona: 'league_admin',
    });

    const refreshedLeagueToken = await signInWithPassword(plan, ids.leagueOperatorEmail);
    const leagueContext = await callApi<AccessContextResponse>(plan, steps, {
      name: 'league_operator_context',
      path: '/api/access/context',
      method: 'GET',
      bearerToken: refreshedLeagueToken,
      expectedStatus: 200,
    });
    assertContextHasScope(leagueContext, 'league', approval.leagueId, 'league.team.create');

    const createTeams = await callApi<CreateTeamsResponse>(plan, steps, {
      name: 'league_operator_creates_team',
      path: '/api/admin/actions',
      bearerToken: refreshedLeagueToken,
      body: {
        action: 'create_teams',
        teams: [teamBody(ids, approval.leagueId, created.seasonId!)],
      },
      expectedStatus: 200,
    });
    assertEqual(createTeams.id, ids.teamId, 'created team id');

    const fanBlockedInvitation = await callApi<TeamInvitationResponse>(plan, steps, {
      name: 'league_invites_existing_fan_to_team_admin',
      path: '/api/admin/actions',
      bearerToken: refreshedLeagueToken,
      body: {
        action: 'create_team_invitation',
        teamId: ids.teamId,
        leagueId: approval.leagueId,
        seasonId: created.seasonId,
        invitedEmail: ids.fanInviteBlockEmail,
      },
      expectedStatus: 200,
    });
    created.fanBlockedInvitationId = fanBlockedInvitation.id;
    created.fanBlockedInvitationToken = fanBlockedInvitation.token;
    await createAuthUserWithProfile({
      auth,
      db,
      uid: ids.fanInviteBlockUid,
      email: ids.fanInviteBlockEmail,
      password: plan.password,
      accountClass: 'fan',
      role: 'fan',
      claims: { role: 'fan', accountClass: 'fan' },
    });
    const fanInviteToken = await signInWithPassword(plan, ids.fanInviteBlockEmail);
    await callApi(plan, steps, {
      name: 'fan_cannot_accept_team_admin_invitation',
      path: '/api/access',
      bearerToken: fanInviteToken,
      body: {
        action: 'accept_invitation',
        invitationId: fanBlockedInvitation.id,
        token: fanBlockedInvitation.token,
      },
      expectedStatus: 409,
    });
    await assertDocFields(db, 'users', ids.fanInviteBlockUid, { accountClass: 'fan', role: 'fan' });

    const teamInvitation = await callApi<TeamInvitationResponse>(plan, steps, {
      name: 'league_invites_operator_to_team_admin',
      path: '/api/admin/actions',
      bearerToken: refreshedLeagueToken,
      body: {
        action: 'create_team_invitation',
        teamId: ids.teamId,
        leagueId: approval.leagueId,
        seasonId: created.seasonId,
        invitedEmail: ids.teamOperatorEmail,
      },
      expectedStatus: 200,
    });
    created.teamInvitationId = teamInvitation.id;
    created.teamInvitationToken = teamInvitation.token;
    await createAuthUserWithProfile({
      auth,
      db,
      uid: ids.teamOperatorUid,
      email: ids.teamOperatorEmail,
      password: plan.password,
      accountClass: 'organization_operator',
      role: 'team_admin',
      claims: { accountClass: 'organization_operator' },
    });
    const teamOperatorToken = await signInWithPassword(plan, ids.teamOperatorEmail);
    const acceptedTeam = await callApi<AcceptInvitationResponse>(plan, steps, {
      name: 'operator_accepts_team_admin_invitation',
      path: '/api/access',
      bearerToken: teamOperatorToken,
      body: {
        action: 'accept_invitation',
        invitationId: teamInvitation.id,
        token: teamInvitation.token,
      },
      expectedStatus: 200,
    });
    assertEqual(acceptedTeam.role, 'team_admin', 'accepted team invitation role');
    assertEqual(acceptedTeam.scopeId, ids.teamId, 'accepted team invitation scope');

    const refreshedTeamToken = await signInWithPassword(plan, ids.teamOperatorEmail);
    const teamContext = await callApi<AccessContextResponse>(plan, steps, {
      name: 'team_operator_context',
      path: '/api/access/context',
      method: 'GET',
      bearerToken: refreshedTeamToken,
      expectedStatus: 200,
    });
    assertContextHasScope(teamContext, 'team', ids.teamId, 'team.athlete.create');
    assertions.roleFlow = {
      existingFanRejectedForLeagueApproval: true,
      fanRejectedForTeamAdminInvitation: true,
      leagueOperatorScope: approval.leagueId,
      teamOperatorScope: ids.teamId,
    };

    const report: SmokeReport = {
      runId: plan.runId,
      projectId: plan.projectId,
      databaseId: plan.databaseId,
      baseUrl: plan.baseUrl,
      startedAt,
      completedAt: new Date().toISOString(),
      ids,
      created,
      steps,
      assertions,
      cleanup,
    };
    if (!plan.keep) {
      cleanup.attempted = true;
      cleanup.deletedDocuments = await cleanupFirestore(db, ids, created, clientIp);
      cleanup.deletedUsers = await cleanupAuthUsers(auth, ids);
    }
    const reportPath = await writeReport(report);
    if (plan.json) {
      console.log(JSON.stringify({ ok: true, reportPath, report }, null, 2));
    } else {
      console.log(`Role staging smoke passed. Evidence: ${reportPath}`);
      console.log('Verified: public application, Fan-email rejection, platform approval, league operator invite, team creation, Fan invite rejection, and team operator invite.');
    }
  } catch (error) {
    if (!plan.keep) {
      cleanup.attempted = true;
      cleanup.deletedDocuments += await cleanupFirestore(db, ids, created, clientIp).catch(() => 0);
      cleanup.deletedUsers = await cleanupAuthUsers(auth, ids).catch(() => []);
    }
    const message = error instanceof Error ? error.message : 'Unknown role staging smoke failure.';
    const report: SmokeReport = {
      runId: plan.runId,
      projectId: plan.projectId,
      databaseId: plan.databaseId,
      baseUrl: plan.baseUrl,
      startedAt,
      completedAt: new Date().toISOString(),
      ids,
      created,
      steps,
      assertions: { ...assertions, failure: message },
      cleanup,
    };
    const reportPath = await writeReport(report);
    console.error(`Role staging smoke failed. Evidence: ${reportPath}`);
    console.error(message);
    process.exitCode = 1;
  } finally {
    await deleteApp(app).catch(() => undefined);
  }
}

function valueAfter(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeBaseUrl(raw: string) {
  const url = new URL(raw);
  const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocal) {
    throw new Error('GOALPLACE_STAGING_BASE_URL must be HTTPS unless targeting localhost.');
  }
  return url.toString().replace(/\/$/, '');
}

function normalizeRunId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
}

function isProductionProject(projectId: string, projectMap: ProjectMap) {
  return projectId === projectMap.projects?.prod || PROD_PROJECT_PATTERN.test(projectId);
}

async function assertProjectCompatibility(plan: RoleSmokePlan) {
  validateProjectCompatibility({
    planProjectId: plan.projectId,
    credentialProjectId: credentialProjectId(),
    hostedProjectId: await hostedProjectId(plan.baseUrl),
  });
}

function credentialProjectId() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath || !fs.existsSync(credentialsPath)) return undefined;
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8')) as { project_id?: string };
  return credentials.project_id;
}

async function hostedProjectId(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/environment`).catch(() => null);
  if (!response?.ok) return undefined;
  const body = await response.json().catch(() => null) as { firebaseProjectId?: string } | null;
  return body?.firebaseProjectId;
}

function syntheticClientIp(seed: string) {
  const octet = Number.parseInt(sha256(seed).slice(0, 2), 16) % 200;
  return `10.42.${octet}.1`;
}

function createAdminApp(plan: RoleSmokePlan): App {
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  return initializeApp({
    credential: clientEmail && privateKey
      ? cert({ projectId: plan.projectId, clientEmail, privateKey })
      : applicationDefault(),
    projectId: plan.projectId,
  }, `role-smoke-${plan.runId}`);
}

async function createAuthUserWithProfile(input: {
  auth: ReturnType<typeof getAuth>;
  db: Firestore;
  uid: string;
  email: string;
  password: string;
  accountClass: 'fan' | 'organization_operator' | 'platform_operator';
  role: string;
  claims: Record<string, unknown>;
}) {
  await input.auth.createUser({
    uid: input.uid,
    email: input.email,
    emailVerified: true,
    password: input.password,
    displayName: `Smoke ${input.role}`,
    disabled: false,
  });
  await input.auth.setCustomUserClaims(input.uid, input.claims);
  await input.db.collection('users').doc(input.uid).set(
    userSeed(input.uid, input.email, input.accountClass, input.role),
  );
}

async function signInWithPassword(plan: RoleSmokePlan, email: string) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${plan.apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password: plan.password,
      returnSecureToken: true,
    }),
  });
  const body = await response.json().catch(() => ({})) as IdentityToolkitResponse;
  if (!response.ok || !body.idToken) {
    throw new Error(`Smoke sign-in failed for ${email}: ${body.error?.message ?? response.statusText}`);
  }
  return body.idToken;
}

function leagueApplicationBody(input: { applicantEmail: string; leagueName: string }) {
  return {
    applicantName: 'Smoke Applicant',
    applicantPhone: '+256700000000',
    applicantEmail: input.applicantEmail,
    leagueName: input.leagueName,
    sport: 'rugby',
    city: 'Kampala',
    evidenceNote: 'Staging smoke test evidence note for operator onboarding and account-class separation.',
  };
}

function teamBody(ids: RoleSmokeIds, leagueId: string, seasonId: string) {
  return {
    id: ids.teamId,
    name: `Smoke Rugby Club ${ids.suffix}`,
    sport: 'rugby',
    leagueId,
    city: 'Kampala',
    location: 'Staging Field',
    country: 'Uganda',
    description: 'Temporary staging smoke team.',
    plan: 'free',
    verified: false,
    adminUserIds: [],
    totalSupport: 0,
    supportersCount: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    leaguePoints: 0,
    verificationStatus: 'pending',
    seasonId,
  };
}

async function callApi<T = unknown>(
  plan: RoleSmokePlan,
  steps: ApiStep[],
  options: {
    name: string;
    path: string;
    body?: Record<string, unknown>;
    bearerToken?: string;
    forwardedFor?: string;
    expectedStatus: number;
    method?: 'GET' | 'POST';
  },
): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.bearerToken) headers.authorization = `Bearer ${options.bearerToken}`;
  if (options.forwardedFor) headers['x-forwarded-for'] = options.forwardedFor;
  const response = await fetch(`${plan.baseUrl}${options.path}`, {
    method: options.method ?? 'POST',
    headers,
    ...(options.method === 'GET' ? {} : { body: JSON.stringify(options.body ?? {}) }),
  });
  const body = await readResponseBody(response);
  steps.push({ name: options.name, status: response.status, ok: response.ok, body });
  if (response.status !== options.expectedStatus) {
    throw new Error(`${options.name} expected ${options.expectedStatus} but received ${response.status}: ${JSON.stringify(body)}`);
  }
  return body as T;
}

async function readResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
}

function tokenFromActionUrl(actionUrl: string) {
  const url = new URL(actionUrl, 'https://goalplace256.test');
  const token = url.searchParams.get('token');
  if (!token) throw new Error(`Invitation action URL did not contain a token: ${actionUrl}`);
  return token;
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`Expected ${label} to be ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

function assertContextHasScope(
  context: AccessContextResponse,
  scopeType: string,
  scopeId: string,
  capability: string,
) {
  if (context.accountClass !== 'organization_operator') {
    throw new Error(`Expected organization_operator context, received ${context.accountClass}.`);
  }
  const scope = context.indexes.find((index) =>
    index.scopeType === scopeType
    && index.scopeId === scopeId
    && index.capabilities.includes(capability),
  );
  if (!scope) {
    throw new Error(`Expected access context to include ${scopeType}:${scopeId} with ${capability}.`);
  }
}

async function assertDocFields(
  db: Firestore,
  collection: string,
  id: string,
  expected: Record<string, unknown>,
) {
  const snapshot = await db.collection(collection).doc(id).get();
  if (!snapshot.exists) throw new Error(`Expected ${collection}/${id} to exist.`);
  const data = snapshot.data() ?? {};
  for (const [key, value] of Object.entries(expected)) {
    if (data[key] !== value) {
      throw new Error(`Expected ${collection}/${id}.${key} to be ${JSON.stringify(value)}, received ${JSON.stringify(data[key])}.`);
    }
  }
}

async function cleanupFirestore(db: Firestore, ids: RoleSmokeIds, created: CreatedIds, clientIp: string) {
  let deleted = 0;
  const directPaths: Array<[string, string | undefined]> = [
    ['users', ids.platformUid],
    ['users', ids.existingFanUid],
    ['users', ids.leagueOperatorUid],
    ['users', ids.fanInviteBlockUid],
    ['users', ids.teamOperatorUid],
    ['leagueAdminApplications', created.blockedApplicationId],
    ['leagueAdminApplications', created.approvedApplicationId],
    ['organizations', created.organizationId],
    ['leagues', created.leagueId],
    ['seasons', created.seasonId],
    ['teams', ids.teamId],
    ['invitations', created.leagueInvitationId],
    ['invitations', created.fanBlockedInvitationId],
    ['invitations', created.teamInvitationId],
    ['teamAssignments', created.fanBlockedInvitationId],
    ['teamAssignments', created.teamInvitationId],
    ['accessAssignments', created.leagueInvitationId ? `assignment_${created.leagueInvitationId}` : undefined],
    ['accessAssignments', created.teamInvitationId ? `assignment_${created.teamInvitationId}` : undefined],
    ['accessIndex', created.leagueId ? accessIndexId('league', created.leagueId, ids.leagueOperatorUid) : undefined],
    ['accessIndex', accessIndexId('team', ids.teamId, ids.teamOperatorUid)],
    ['apiRateLimits', applicationRateLimitId({
      clientIp,
      applicantEmail: ids.existingFanEmail,
      leagueName: ids.blockedLeagueName,
      city: 'Kampala',
    })],
    ['apiRateLimits', applicationRateLimitId({
      clientIp,
      applicantEmail: ids.leagueOperatorEmail,
      leagueName: ids.leagueName,
      city: 'Kampala',
    })],
  ];
  for (const [collection, id] of directPaths) {
    if (!id) continue;
    await db.collection(collection).doc(id).delete().then(() => { deleted += 1; });
  }
  deleted += await deleteQuery(db, db.collection('adminAuditEvents').where('actorUserId', 'in', [
    ids.platformUid,
    ids.leagueOperatorUid,
    ids.teamOperatorUid,
  ]));
  return deleted;
}

async function deleteQuery(db: Firestore, query: FirebaseFirestore.Query) {
  let deleted = 0;
  const snapshot = await query.get();
  for (let index = 0; index < snapshot.docs.length; index += 450) {
    const batch = db.batch();
    for (const doc of snapshot.docs.slice(index, index + 450)) {
      batch.delete(doc.ref);
      deleted += 1;
    }
    await batch.commit();
  }
  return deleted;
}

async function cleanupAuthUsers(auth: ReturnType<typeof getAuth>, ids: RoleSmokeIds) {
  const deleted: string[] = [];
  for (const uid of [
    ids.platformUid,
    ids.existingFanUid,
    ids.leagueOperatorUid,
    ids.fanInviteBlockUid,
    ids.teamOperatorUid,
  ]) {
    await auth.deleteUser(uid)
      .then(() => { deleted.push(uid); })
      .catch(() => undefined);
  }
  return deleted;
}

async function writeReport(report: SmokeReport) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `role-auth-firestore-smoke-${report.runId}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  void run();
}
