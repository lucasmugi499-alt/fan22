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
  | 'league.team.create'
  | 'league.team_admin.invite'
  | 'league.roster.verify'
  | 'league.result.resolve'
  | 'league.notice.publish'
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
};

export type AccessContext = {
  userId: string;
  indexes: AccessIndexDocument[];
  accessVersion: number;
  teamLeagueIds?: Record<string, string>;
  athleteTeamIds?: Record<string, string>;
};

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
      'league.profile.manage',
      'league.team.create',
      'league.team_admin.invite',
      'league.result.resolve',
      'team.profile.manage',
      'team.staff.invite',
      'team.roster.manage',
      'team.athlete.create',
      'team.athlete.invite',
      'team.result.submit',
      'team.result.confirm',
      'ownership.transfer',
    ],
  },
  {
    id: 'league_owner',
    version: '1.0.0',
    roleKey: 'league_owner',
    label: 'League Owner',
    capabilities: [
      'league.profile.manage',
      'league.season.manage',
      'league.team.create',
      'league.team_admin.invite',
      'league.roster.verify',
      'league.result.resolve',
      'league.notice.publish',
      'ownership.transfer',
    ],
  },
  {
    id: 'league_admin',
    version: '1.0.0',
    roleKey: 'league_admin',
    label: 'League Admin',
    capabilities: [
      'league.profile.manage',
      'league.season.manage',
      'league.team.create',
      'league.team_admin.invite',
      'league.roster.verify',
      'league.result.resolve',
      'league.notice.publish',
    ],
  },
  {
    id: 'full_team_admin',
    version: '1.0.0',
    roleKey: 'team_admin',
    label: 'Full Team Admin',
    capabilities: [
      'team.profile.manage',
      'team.staff.invite',
      'team.roster.manage',
      'team.athlete.create',
      'team.athlete.invite',
      'team.result.submit',
      'team.result.confirm',
      'team.update.publish',
    ],
  },
  {
    id: 'results_only',
    version: '1.0.0',
    roleKey: 'result_reporter',
    label: 'Results Only',
    capabilities: ['team.result.submit', 'team.result.confirm'],
  },
  {
    id: 'roster_only',
    version: '1.0.0',
    roleKey: 'roster_manager',
    label: 'Roster Only',
    capabilities: ['team.roster.manage', 'team.athlete.create', 'team.athlete.invite'],
  },
  {
    id: 'athlete_self',
    // 2.0.0: profile and media authority removed. Claiming an athlete profile no longer
    // makes the athlete an editor of their own public sporting record — it gives them their
    // payee portal and the ability to propose. The team remains the author of the record.
    version: '2.0.0',
    roleKey: 'athlete_self',
    label: 'Athlete Self',
    capabilities: ['athlete.support_need.propose', 'athlete.challenge.propose', 'athlete.payee.submit'],
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
    grouped.set(key, existing);
  }
  return [...grouped.values()].sort((left, right) =>
    `${left.scopeType}:${left.scopeId}:${left.userId}`.localeCompare(`${right.scopeType}:${right.scopeId}:${right.userId}`),
  );
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

function hasTeamCapabilityForAthlete(
  context: AccessContext | undefined,
  athleteId: string,
  capability: PermissionCapability,
) {
  const teamId = context?.athleteTeamIds?.[athleteId];
  return Boolean(teamId && hasScopeCapability(context, 'team', teamId, capability));
}

export function canManageTeamInScope(context: AccessContext | undefined, teamId: string) {
  return (
    hasPlatformCapability(context, 'team.profile.manage')
    || hasLeagueCapabilityForTeam(context, teamId, 'league.team.create')
    || hasScopeCapability(context, 'team', teamId, 'team.profile.manage')
  );
}

export function canManageLeagueInScope(context: AccessContext | undefined, leagueId: string) {
  return (
    hasPlatformCapability(context, 'league.profile.manage')
    || hasScopeCapability(context, 'league', leagueId, 'league.profile.manage')
  );
}

export function canInviteTeamAdminInScope(context: AccessContext | undefined, teamId: string) {
  return (
    hasPlatformCapability(context, 'team.staff.invite')
    || hasLeagueCapabilityForTeam(context, teamId, 'league.team_admin.invite')
    || hasScopeCapability(context, 'team', teamId, 'team.staff.invite')
  );
}

export function canCreateAthleteInScope(context: AccessContext | undefined, teamId: string) {
  return (
    hasPlatformCapability(context, 'team.athlete.create')
    || hasLeagueCapabilityForTeam(context, teamId, 'league.roster.verify')
    || hasScopeCapability(context, 'team', teamId, 'team.athlete.create')
  );
}

/**
 * Who may write an athlete's public sporting record.
 *
 * Not the athlete. An athlete profile is a managed record held by the team that knows them,
 * so the authority runs team-first: the club that put them on the roster is the party that
 * can say what their position is. The athlete-scoped self grant that used to appear here
 * went with `athlete.profile.manage` — an athlete no longer needs an account to exist in the
 * record, and what they keep is their payee identity, which this function has no say over.
 */
export function canManageAthleteInScope(context: AccessContext | undefined, athleteId: string) {
  return (
    hasPlatformCapability(context, 'platform.athlete.manage')
    || hasTeamCapabilityForAthlete(context, athleteId, 'team.roster.manage')
    || hasTeamCapabilityForAthlete(context, athleteId, 'team.athlete.create')
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
