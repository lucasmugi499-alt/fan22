export type AccessRoleKey =
  | 'super_admin'
  | 'platform_admin'
  | 'platform_reviewer'
  | 'platform_support'
  | 'league_owner'
  | 'league_admin'
  | 'league_operator'
  | 'league_verifier'
  | 'team_owner'
  | 'team_admin'
  | 'roster_manager'
  | 'result_reporter'
  | 'content_manager'
  | 'athlete_self'
  | 'athlete_guardian';

export type AccessScopeType = 'platform' | 'organization' | 'league' | 'team' | 'athlete';

export type AccessAssignmentStatus = 'pending' | 'active' | 'suspended' | 'expired' | 'revoked';

export type PermissionCapability =
  | 'platform.admin.manage'
  | 'platform.application.review'
  | 'platform.organization.create'
  | 'platform.organization.archive'
  | 'platform.user.suspend'
  | 'platform.audit.read'
  // Added 2026-08-09 so the most powerful platform commands stop being gated by role
  // alone. Each names one command in src/app/api/admin/actions/route.ts; they are
  // deliberately separate capabilities rather than one broad grant, because revoking the
  // ability to decide a trust case should not also revoke the ability to review an
  // application.
  | 'platform.accounts.lifecycle'
  | 'platform.trust.decide'
  | 'platform.access.revoke'
  | 'platform.access.manage'
  | 'platform.organizations.identity.manage'
  | 'platform.verification.team.manage'
  // Deliberately its own capability, and deliberately governance-only. Moving an
  // environment is the most consequential act on the platform, so it is not folded into
  // day-to-day platform administration.
  | 'platform.environment.activate'
  // Added 2026-08-22 with the operating console. Creating, editing and archiving the
  // network is day-to-day platform work, but it is separable from deciding trust cases or
  // reading the audit trail, so it is its own capability rather than another use of
  // platform.admin.manage.
  | 'platform.network.manage'
  // Athlete profiles are managed records: the team that knows the athlete writes them, and
  // Platform can too. Separate from network.manage because a support operator may need to
  // fix an athlete's name without being able to archive a league.
  | 'platform.athlete.manage'
  // Public site copy, registration windows and feature visibility. Explicitly NOT traffic
  // routing, payments enablement, finalizer mode or environment activation — those are
  // approval workflows, and `GOVERNED_SWITCHES` keeps them off the settings surface.
  | 'platform.site.manage'
  // Attesting that payout details belong to the athlete they name. Held apart from every
  // other platform capability because it is the one that decides where money goes.
  | 'platform.payee.verify'
  | 'league.profile.manage'
  | 'league.season.manage'
  // Normalizes `league.team.create`, which named one verb where the League governs the
  // whole lifecycle. The old name is retained below as deprecated so historical
  // assignments stay interpretable.
  | 'league.team.manage'
  // Added 2026-08-24 with ADR-003. These are League-NATIVE, deliberately not the `team.*`
  // capabilities re-pointed at a league scope. Granting a League Admin `team.roster.manage`
  // would encode "League Admin is pretending to be every Team Admin"; the architecture is
  // "the League governs its teams, including their rosters". In five years the names are
  // the only surviving explanation of which one was meant.
  | 'league.roster.manage'
  | 'league.athlete.manage'
  | 'league.fixture.manage'
  | 'league.field_manager.manage'
  // Held apart from `result.resolve` because entering a result and adjudicating one are
  // different acts. Gated by the fixture's bound capture policy as well as by this
  // capability: holding it does not mean a FIELD_REQUIRED competition will accept a typed score.
  | 'league.result.enter'
  | 'league.result.resolve'
  // Seizing a live match from a Field Manager whose device has failed. Condition-gated:
  // it does nothing unless a session is actually in progress.
  | 'league.match.takeover'
  | 'league.notice.publish'
  // Deprecated 2026-08-24. Never issued again; still resolvable so historical assignments
  // and audit records keep their meaning.
  | 'league.team.create'
  | 'league.team_admin.invite'
  | 'league.roster.verify'
  | 'team.profile.manage'
  | 'team.staff.invite'
  | 'team.roster.manage'
  | 'team.athlete.create'
  | 'team.athlete.invite'
  | 'team.result.submit'
  | 'team.result.confirm'
  | 'team.update.publish'
  // `athlete.profile.manage` and `athlete.media.manage` were removed on 2026-08-22 when
  // athletes became managed profiles. The team that knows the athlete writes their name,
  // photo, position and roster status through team.roster.manage; an athlete no longer
  // needs an account to exist in the sporting record, and self-editing a public sporting
  // identity is not a thing this platform wants to offer.
  //
  // What an athlete keeps is what is genuinely theirs: proposing, and their money.
  // Added 2026-08-24 with ADR-001. Named for what they actually govern: the persona is the
  // athlete's own public identity, and none of these can write `athletes/{athleteId}`.
  // `athlete.profile.manage` and `athlete.media.manage` stay permanently retired, because
  // those names imply authority over the sporting entity rather than over a self-description.
  | 'athlete.persona.manage'
  | 'athlete.persona.media.manage'
  | 'athlete.posts.publish'
  | 'athlete.posts.manage'
  | 'athlete.backings.view'
  | 'athlete.support_need.propose'
  | 'athlete.challenge.propose'
  // The athlete or guardian's own payout identity, submitted through their portal. Never
  // held by a team: see src/lib/platform/athletePayee.ts for why that line exists.
  | 'athlete.payee.submit'
  | 'ownership.transfer'
  | 'break_glass.activate';

export type PermissionBundle = {
  id: string;
  version: string;
  roleKey: AccessRoleKey;
  label: string;
  capabilities: PermissionCapability[];
};

export type AccessAssignment = {
  id: string;
  userId: string;
  roleKey: AccessRoleKey;
  scopeType: AccessScopeType;
  scopeId: string;
  permissionBundleId: string;
  status: AccessAssignmentStatus;
  grantedByUserId: string;
  invitationId?: string;
  applicationId?: string;
  validFrom: string;
  validUntil?: string;
  suspendedAt?: string;
  revokedAt?: string;
  revocationReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type AccessIndexDocument = {
  userId: string;
  scopeType: AccessScopeType;
  scopeId: string;
  activeRoles: AccessRoleKey[];
  capabilities: PermissionCapability[];
  assignmentIds: string[];
  accessVersion: number;
  updatedAt: string;
  /**
   * The earliest moment any assignment behind this projection stops being valid, or absent
   * when none of them expire.
   *
   * This field exists because the projector previously filtered expired assignments only at
   * the moment it ran. A `validUntil` that passed on Tuesday left Monday's projection in
   * place, and every reader — Firestore Rules included — went on granting capabilities from
   * it. A time-limited grant could outlive its own expiry indefinitely, bounded only by
   * whether something unrelated happened to touch that user's assignments again.
   *
   * Carrying expiry INTO the projection makes the guarantee independent of any worker
   * running: a reader can tell an expired projection is expired. The sweeper further down is
   * hygiene — it removes dead documents — not the control that makes expiry safe.
   *
   * Stored twice on purpose. The ISO string is what humans and audit records read; the epoch
   * milliseconds are what Firestore Rules can actually compare against `request.time`, since
   * rules cannot parse ISO strings.
   */
  expiresAt?: string;
  expiresAtMillis?: number;
};

export type AccessContext = {
  userId: string;
  indexes: AccessIndexDocument[];
  accessVersion: number;
  teamLeagueIds?: Record<string, string>;
  athleteTeamIds?: Record<string, string>;
};

/**
 * What a League Admin can do, in one list, because both league bundles hold it.
 *
 * Deliberately contains no `team.*` capability, and that is an invariant rather than an
 * oversight. `team.roster.manage` on a league bundle would work today and would encode into
 * the access model the statement "League Admin is pretending to be every Team Admin". The
 * architecture is "the League inherently governs league resources, including its
 * participating teams", and the capability names are the only part of that distinction that
 * survives into a future where nobody remembers this decision.
 */
export const LEAGUE_ADMIN_CAPABILITIES: PermissionCapability[] = [
  'league.profile.manage',
  'league.season.manage',
  'league.team.manage',
  'league.roster.manage',
  'league.athlete.manage',
  'league.fixture.manage',
  'league.field_manager.manage',
  'league.result.enter',
  'league.result.resolve',
  'league.match.takeover',
  'league.notice.publish',
];

/**
 * Capabilities that may never be granted again, and why.
 *
 * Deprecation rather than removal. Existing assignments still resolve, historical records
 * still interpret, and migration tooling can still inspect them. What changes is that no new
 * assignment or invitation may request one: `issuableCapabilities()` is the single list any
 * granting surface must filter through, so a UI cannot offer one by forgetting to.
 */
export const DEPRECATED_CAPABILITIES: Record<string, string> = {
  'team.profile.manage': 'ADR-004: Team Admin retired as an account class.',
  'team.staff.invite': 'ADR-004: Team Admin retired as an account class.',
  'team.roster.manage': 'ADR-004: superseded by league.roster.manage.',
  'team.athlete.create': 'ADR-004: superseded by league.athlete.manage.',
  'team.athlete.invite': 'ADR-004: superseded by league.athlete.manage.',
  'team.result.submit': 'ADR-004: superseded by field capture and league.result.enter.',
  'team.result.confirm': 'ADR-004: Result Workflow V1 is frozen.',
  'team.update.publish': 'ADR-004: Team Admin retired as an account class.',
  'league.team_admin.invite': 'ADR-004: there is no Team Admin to invite.',
  'league.team.create': 'ADR-003: normalized into league.team.manage.',
  'league.roster.verify': 'ADR-003: normalized into league.roster.manage.',
};

export function isIssuableCapability(capability: PermissionCapability) {
  return !(capability in DEPRECATED_CAPABILITIES);
}

/** The capabilities a new assignment or invitation is permitted to request. */
export function issuableCapabilities(capabilities: PermissionCapability[]) {
  return capabilities.filter(isIssuableCapability);
}

/**
 * Bundles that may still be issued. A zeroed bundle is not merely empty: offering it would
 * create an assignment that grants nothing and reads, to whoever accepts it, as a role.
 */
export function isIssuableBundle(bundle: PermissionBundle) {
  return bundle.capabilities.length > 0;
}

export const PERMISSION_BUNDLES: PermissionBundle[] = [
  {
    id: 'super_admin_governance',
    version: '1.2.0',
    roleKey: 'super_admin',
    label: 'Super Admin Governance',
    capabilities: [
      'platform.admin.manage',
      'platform.application.review',
      'platform.organization.create',
      'platform.organization.archive',
      'platform.user.suspend',
      'platform.audit.read',
      'platform.accounts.lifecycle',
      'platform.trust.decide',
      'platform.access.revoke',
      'platform.access.manage',
      'platform.organizations.identity.manage',
      'platform.verification.team.manage',
      'platform.environment.activate',
      'platform.network.manage',
      'platform.athlete.manage',
      'platform.site.manage',
      'platform.payee.verify',
      'ownership.transfer',
      'break_glass.activate',
    ],
  },
  {
    id: 'platform_admin',
    version: '1.2.0',
    roleKey: 'platform_admin',
    label: 'Platform Admin',
    capabilities: [
      // Added 2026-08-08 on the owner's instruction, so that the `hasRoleGrant` bypass in
      // securePlatformCommand can be removed without locking anyone out. That bypass
      // already gives every Platform Admin *every* capability; naming this one explicitly
      // is strictly narrower than the status quo, not broader.
      //
      // Note this grants the capability to the platform_admin ROLE, not to two chosen
      // accounts — the projection derives capabilities from this bundle and assignments
      // carry no per-user overrides. Today that role is held by exactly two accounts.
      'platform.admin.manage',
      'platform.application.review',
      'platform.organization.create',
      'platform.organization.archive',
      'platform.user.suspend',
      'platform.audit.read',
      'platform.accounts.lifecycle',
      'platform.trust.decide',
      'platform.access.revoke',
      'platform.access.manage',
      'platform.organizations.identity.manage',
      'platform.verification.team.manage',
      'platform.network.manage',
      'platform.athlete.manage',
      'platform.site.manage',
      'platform.payee.verify',
      // League-native since 2026-08-24. Platform previously held the `team.*` capabilities
      // directly, which made it the last issuer of an authority class that ADR-004 retires.
      // Platform's exceptional reach into a league's teams now runs through the same
      // capabilities a League Admin uses, plus the platform-global grant that
      // `hasCapabilityOrPlatformGrant` already consults.
      'league.profile.manage',
      'league.season.manage',
      'league.team.manage',
      'league.roster.manage',
      'league.athlete.manage',
      'league.fixture.manage',
      'league.field_manager.manage',
      'league.result.enter',
      'league.result.resolve',
      'league.match.takeover',
      'ownership.transfer',
    ],
  },
  {
    id: 'league_owner',
    // 2.0.0 alongside league_admin. ADR-003 specifies one league product role and names
    // only `league_admin`, but two league bundles exist. Left at 1.0.0 this one would have
    // become the stale privileged role: still carrying `league.team_admin.invite` after
    // Team Admin is retired, and never gaining `result.enter` or `match.takeover`, so an
    // owner would end up less able to run their league than an admin of it.
    version: '2.0.0',
    roleKey: 'league_owner',
    label: 'League Owner',
    capabilities: [
      ...LEAGUE_ADMIN_CAPABILITIES,
      'ownership.transfer',
    ],
  },
  {
    id: 'league_admin',
    // 2.0.0: absorbs what Team Admin used to do, as League-native authority rather than
    // by inheriting `team.*`. See LEAGUE_ADMIN_CAPABILITIES.
    version: '2.0.0',
    roleKey: 'league_admin',
    label: 'League Admin',
    capabilities: [...LEAGUE_ADMIN_CAPABILITIES],
  },
  {
    id: 'full_team_admin',
    // 3.0.0, zero capabilities. ADR-004 retires Team Admin as an account class without
    // deleting anything: the projector derives capabilities from the bundle, so authority
    // drops on the next projection rebuild while every assignment record survives as the
    // historical fact that this person held this authority during this period. Deleting
    // them would make hundreds of submissions, confirmations and audit events
    // uninterpretable.
    version: '3.0.0',
    roleKey: 'team_admin',
    label: 'Full Team Admin (retired)',
    capabilities: [],
  },
  {
    id: 'results_only',
    version: '3.0.0',
    roleKey: 'result_reporter',
    label: 'Results Only (retired)',
    capabilities: [],
  },
  {
    id: 'roster_only',
    version: '3.0.0',
    roleKey: 'roster_manager',
    label: 'Roster Only (retired)',
    capabilities: [],
  },
  {
    id: 'athlete_self',
    /**
     * 3.0.0: the athlete gets a persona, posts and a view of their backings.
     *
     * 2.0.0 removed profile and media authority and gave nothing back, which left an account
     * worth opening about twice a season. ADR-001 restores a first-class consumer experience
     * without reopening the sporting record: everything here writes `athletePersonas` or
     * `feedPosts`, and nothing writes `athletes/{athleteId}`. That is invariant 06, and it is
     * the reason the capabilities are named for the persona rather than for the profile.
     */
    version: '3.0.0',
    roleKey: 'athlete_self',
    label: 'Athlete Self',
    capabilities: [
      'athlete.persona.manage',
      'athlete.persona.media.manage',
      'athlete.posts.publish',
      'athlete.posts.manage',
      'athlete.backings.view',
      'athlete.support_need.propose',
      'athlete.challenge.propose',
      'athlete.payee.submit',
    ],
  },
  {
    id: 'athlete_guardian',
    version: '2.0.0',
    roleKey: 'athlete_guardian',
    label: 'Athlete Guardian',
    capabilities: ['athlete.support_need.propose', 'athlete.payee.submit'],
  },
];

const bundleById = new Map(PERMISSION_BUNDLES.map((bundle) => [bundle.id, bundle]));

export function isActiveAccessAssignment(assignment: AccessAssignment, now: Date) {
  if (assignment.status !== 'active') return false;
  if (Date.parse(assignment.validFrom) > now.getTime()) return false;
  if (assignment.validUntil && Date.parse(assignment.validUntil) <= now.getTime()) return false;
  return true;
}

export function capabilitiesForAssignment(assignment: Pick<AccessAssignment, 'permissionBundleId' | 'roleKey'>) {
  const bundle = bundleById.get(assignment.permissionBundleId);
  if (bundle) return bundle.capabilities;
  return PERMISSION_BUNDLES.find((candidate) => candidate.roleKey === assignment.roleKey)?.capabilities ?? [];
}

export function buildAccessIndexDocuments({
  assignments,
  accessVersion,
  updatedAt,
  now = new Date(updatedAt),
}: {
  assignments: AccessAssignment[];
  accessVersion: number;
  updatedAt: string;
  now?: Date;
}) {
  const grouped = new Map<string, AccessIndexDocument>();
  const activeAssignments = [...assignments]
    .filter((assignment) => isActiveAccessAssignment(assignment, now))
    .sort((left, right) => {
      const scope = `${left.scopeType}:${left.scopeId}:${left.userId}`.localeCompare(`${right.scopeType}:${right.scopeId}:${right.userId}`);
      if (scope !== 0) return scope;
      return left.id.localeCompare(right.id);
    });

  for (const assignment of activeAssignments) {
    const key = `${assignment.scopeType}_${assignment.scopeId}_${assignment.userId}`;
    const existing = grouped.get(key) ?? {
      userId: assignment.userId,
      scopeType: assignment.scopeType,
      scopeId: assignment.scopeId,
      activeRoles: [],
      capabilities: [],
      assignmentIds: [],
      accessVersion,
      updatedAt,
    };
    existing.activeRoles = [...new Set([...existing.activeRoles, assignment.roleKey])].sort();
    existing.capabilities = [...new Set([...existing.capabilities, ...capabilitiesForAssignment(assignment)])].sort();
    existing.assignmentIds = [...new Set([...existing.assignmentIds, assignment.id])].sort();

    // The EARLIEST expiry wins, not the latest.
    //
    // A scope can be held through several assignments at once. Taking the latest would let a
    // long-lived grant keep a short-lived one's capabilities alive past their expiry, which
    // is the same defect one level up. Taking the earliest means the projection stops being
    // trusted the moment any contributing grant lapses, and the next rebuild re-derives
    // whatever legitimately remains.
    if (assignment.validUntil) {
      const millis = Date.parse(assignment.validUntil);
      if (Number.isFinite(millis) && (existing.expiresAtMillis === undefined || millis < existing.expiresAtMillis)) {
        existing.expiresAtMillis = millis;
        existing.expiresAt = assignment.validUntil;
      }
    }
    grouped.set(key, existing);
  }
  return [...grouped.values()].sort((left, right) =>
    `${left.scopeType}:${left.scopeId}:${left.userId}`.localeCompare(`${right.scopeType}:${right.scopeId}:${right.userId}`),
  );
}

/**
 * Whether a projection is still inside its validity window.
 *
 * Every reader of an access index must pass through this. A projection is a cache of a
 * decision, and a cache that cannot say when it went stale is a cache that never does.
 */
export function isAccessIndexLive(
  index: Pick<AccessIndexDocument, 'expiresAtMillis'> | { expiresAtMillis?: unknown } | undefined,
  now: Date = new Date(),
): boolean {
  if (!index) return false;
  const expiry = (index as { expiresAtMillis?: unknown }).expiresAtMillis;
  if (typeof expiry !== 'number') return true;
  return now.getTime() < expiry;
}

export function accessIndexId(scopeType: AccessScopeType, scopeId: string, userId: string) {
  return `${scopeType}_${scopeId}_${userId}`;
}

export function createAccessContext({
  userId,
  assignments,
  accessVersion = 1,
  updatedAt,
  teamLeagueIds,
  athleteTeamIds,
}: {
  userId: string;
  assignments: AccessAssignment[];
  accessVersion?: number;
  updatedAt: string;
  teamLeagueIds?: Record<string, string>;
  athleteTeamIds?: Record<string, string>;
}): AccessContext {
  return {
    userId,
    indexes: buildAccessIndexDocuments({ assignments, accessVersion, updatedAt })
      .filter((index) => index.userId === userId),
    accessVersion,
    teamLeagueIds,
    athleteTeamIds,
  };
}

export function hasPlatformCapability(context: AccessContext | undefined, capability: PermissionCapability) {
  return Boolean(context?.indexes.some((index) =>
    index.scopeType === 'platform'
    && index.scopeId === 'global'
    && isAccessIndexLive(index)
    && index.capabilities.includes(capability),
  ));
}

export function hasScopeCapability(
  context: AccessContext | undefined,
  scopeType: AccessScopeType,
  scopeId: string,
  capability: PermissionCapability,
) {
  return Boolean(context?.indexes.some((index) =>
    index.scopeType === scopeType
    && index.scopeId === scopeId
    // Expiry is checked here rather than only at projection time, so a stale index cannot
    // keep granting after its earliest assignment lapsed.
    && isAccessIndexLive(index)
    && index.capabilities.includes(capability),
  ));
}

function hasLeagueCapabilityForTeam(
  context: AccessContext | undefined,
  teamId: string,
  capability: PermissionCapability,
) {
  const leagueId = context?.teamLeagueIds?.[teamId];
  return Boolean(leagueId && hasScopeCapability(context, 'league', leagueId, capability));
}

/**
 * Athlete to league, through the team they are registered with.
 *
 * Two hops rather than a stored athlete-to-league map, so there is one place that decides
 * which league governs a team and no second copy of it to drift. Replaces
 * `hasTeamCapabilityForAthlete`, which resolved to a team scope that no longer carries
 * capabilities.
 */
function hasLeagueCapabilityForAthlete(
  context: AccessContext | undefined,
  athleteId: string,
  capability: PermissionCapability,
) {
  const teamId = context?.athleteTeamIds?.[athleteId];
  return Boolean(teamId && hasLeagueCapabilityForTeam(context, teamId, capability));
}

/**
 * League-first since ADR-004. The team-scoped arm is gone rather than left in place:
 * `team.profile.manage` resolves to nothing now that the bundles are zeroed, so keeping it
 * would be a branch that reads like an authority path and can never be one.
 */
export function canManageTeamInScope(context: AccessContext | undefined, teamId: string) {
  return (
    hasPlatformCapability(context, 'league.team.manage')
    || hasLeagueCapabilityForTeam(context, teamId, 'league.team.manage')
  );
}

export function canManageLeagueInScope(context: AccessContext | undefined, leagueId: string) {
  return (
    hasPlatformCapability(context, 'league.profile.manage')
    || hasScopeCapability(context, 'league', leagueId, 'league.profile.manage')
  );
}

export function canCreateAthleteInScope(context: AccessContext | undefined, teamId: string) {
  return (
    hasPlatformCapability(context, 'league.athlete.manage')
    || hasLeagueCapabilityForTeam(context, teamId, 'league.athlete.manage')
  );
}

/**
 * Who may write an athlete's public sporting record.
 *
 * Not the athlete. An athlete profile is a managed record, and since ADR-004 the party that
 * holds it is the League: it registers the athlete, it decides eligibility, and it is the
 * one accountable for the roster being true. The athlete-scoped self grant that used to
 * appear here went with `athlete.profile.manage`; what an athlete keeps is their persona and
 * their payee identity, neither of which this function has any say over.
 */
export function canManageAthleteInScope(context: AccessContext | undefined, athleteId: string) {
  return (
    hasPlatformCapability(context, 'platform.athlete.manage')
    || hasLeagueCapabilityForAthlete(context, athleteId, 'league.athlete.manage')
    || hasLeagueCapabilityForAthlete(context, athleteId, 'league.roster.manage')
  );
}

export function canSubmitResultInScope(context: AccessContext | undefined, _matchId: string, teamId: string) {
  return (
    hasPlatformCapability(context, 'team.result.submit')
    || hasScopeCapability(context, 'team', teamId, 'team.result.submit')
  );
}

export function canConfirmSubmissionInScope(context: AccessContext | undefined, _submissionId: string, teamId: string) {
  return (
    hasPlatformCapability(context, 'team.result.confirm')
    || hasScopeCapability(context, 'team', teamId, 'team.result.confirm')
  );
}

export function canResolveDisputeInScope(context: AccessContext | undefined, leagueId: string) {
  return (
    hasPlatformCapability(context, 'league.result.resolve')
    || hasScopeCapability(context, 'league', leagueId, 'league.result.resolve')
  );
}

export function canTransferOwnershipInScope(context: AccessContext | undefined, scopeType: AccessScopeType, scopeId: string) {
  return (
    hasPlatformCapability(context, 'ownership.transfer')
    || hasScopeCapability(context, scopeType, scopeId, 'ownership.transfer')
  );
}
