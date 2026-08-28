import type { PermissionCapability } from '@/lib/auth/access';

export type PlatformCommandTier = 'regular' | 'consequential' | 'governed' | 'quiet';
export type PlatformCommandEntity =
  | 'platform'
  | 'league'
  | 'team'
  | 'athlete'
  | 'person'
  | 'application'
  | 'assignment'
  | 'match'
  | 'exception'
  | 'media'
  | 'payee'
  | 'report'
  | 'activation';

export type PlatformCommandDefinition = {
  id: string;
  label: string;
  description: string;
  entity: PlatformCommandEntity;
  endpoint: string;
  method: 'POST';
  capability: PermissionCapability;
  tier: PlatformCommandTier;
  inputFields: readonly string[];
  reason: 'required' | 'optional' | 'none';
  confirmation: 'none' | 'acknowledge' | `type:${string}`;
  preview: 'server' | 'none';
  audit: {
    action: string;
    targetCollection: string;
  };
  /** Availability is always resolved against live server state for writes. */
  availability: 'server';
  destination: '/admin' | '/admin/network' | '/admin/integrity' | '/admin/money' | '/admin/platform';
  keywords: readonly string[];
};

function defineCommand<const T extends PlatformCommandDefinition>(command: T): T {
  return command;
}

const regular = {
  method: 'POST',
  tier: 'regular',
  reason: 'required',
  confirmation: 'none',
  preview: 'none',
  availability: 'server',
} as const;

const consequential = {
  method: 'POST',
  tier: 'consequential',
  reason: 'required',
  confirmation: 'acknowledge',
  preview: 'server',
  availability: 'server',
} as const;

const governed = (confirmation: `type:${string}`) => ({
  method: 'POST' as const,
  tier: 'governed' as const,
  reason: 'required' as const,
  confirmation,
  preview: 'server' as const,
  availability: 'server' as const,
});

/**
 * The retrieval and consequence contract for every command exposed in Platform Console V2.
 *
 * This registry never authorizes a write. It gives callers one stable vocabulary for finding
 * and presenting commands; the endpoint named by each entry remains responsible for account
 * class, capability, conflict, state-machine, rate-limit, stale-state and audit checks.
 */
export const PLATFORM_COMMANDS = [
  defineCommand({
    method: 'POST', tier: 'quiet', reason: 'required', confirmation: 'none', preview: 'server', availability: 'server',
    id: 'desk.case.defer', label: 'Defer case', description: 'Hide a case from your Desk until a named follow-up time without changing its source status.',
    entity: 'platform', endpoint: '/api/platform/desk/defer', capability: 'platform.admin.manage',
    inputFields: ['caseId', 'sourceCollection', 'sourceId', 'hours', 'reason'],
    audit: { action: 'platform.desk.case_deferred', targetCollection: 'platformCaseDeferrals' },
    destination: '/admin', keywords: ['desk', 'case', 'defer', 'snooze'],
  }),
  defineCommand({
    method: 'POST', tier: 'quiet', reason: 'optional', confirmation: 'none', preview: 'none', availability: 'server',
    id: 'desk.case.assign', label: 'Claim case',
    description: 'Take a case, or release it back to the queue, so operators can divide one queue.',
    entity: 'platform', endpoint: '/api/platform/desk/assign', capability: 'platform.admin.manage',
    inputFields: ['caseId', 'sourceCollection', 'sourceId', 'action', 'reason'],
    audit: { action: 'platform.desk.case_claimed', targetCollection: 'adminAuditEvents' },
    destination: '/admin', keywords: ['desk', 'case', 'claim', 'assign', 'mine'],
  }),
  defineCommand({
    ...regular,
    id: 'network.league.create', label: 'Create league', description: 'Create a private draft league.',
    entity: 'league', endpoint: '/api/platform/network', capability: 'platform.network.manage',
    inputFields: ['name', 'sport', 'city', 'description', 'reason'],
    audit: { action: 'platform.network.createLeague', targetCollection: 'leagues' },
    destination: '/admin/network', keywords: ['league', 'new', 'draft'],
  }),
  defineCommand({
    ...regular,
    id: 'network.league.update', label: 'Update league profile', description: 'Change league identity fields without changing sporting truth.',
    entity: 'league', endpoint: '/api/platform/network', capability: 'platform.network.manage',
    inputFields: ['leagueId', 'patch', 'reason'],
    audit: { action: 'platform.network.updateLeague', targetCollection: 'leagues' },
    destination: '/admin/network', keywords: ['league', 'profile', 'edit'],
  }),
  defineCommand({
    ...regular,
    id: 'network.team.create', label: 'Create team', description: 'Create a private draft team inside a league.',
    entity: 'team', endpoint: '/api/platform/network', capability: 'platform.network.manage',
    inputFields: ['leagueId', 'name', 'city', 'description', 'reason'],
    audit: { action: 'platform.network.createTeam', targetCollection: 'teams' },
    destination: '/admin/network', keywords: ['team', 'new', 'draft'],
  }),
  defineCommand({
    ...regular,
    id: 'network.team.update', label: 'Update team profile', description: 'Change team identity fields without changing results or standings.',
    entity: 'team', endpoint: '/api/platform/network', capability: 'platform.network.manage',
    inputFields: ['teamId', 'patch', 'reason'],
    audit: { action: 'platform.network.updateTeam', targetCollection: 'teams' },
    destination: '/admin/network', keywords: ['team', 'profile', 'edit'],
  }),
  defineCommand({
    ...regular,
    id: 'network.athlete.create', label: 'Create athlete record', description: 'Create an unclaimed managed sporting record.',
    entity: 'athlete', endpoint: '/api/platform/network', capability: 'platform.athlete.manage',
    inputFields: ['teamId', 'name', 'position', 'ageGroup', 'bio', 'reason'],
    audit: { action: 'platform.athlete.createProfile', targetCollection: 'athletes' },
    destination: '/admin/network', keywords: ['athlete', 'record', 'profile'],
  }),
  defineCommand({
    ...regular,
    id: 'network.athlete.update', label: 'Update athlete record', description: 'Change managed record fields; payout identity remains separate.',
    entity: 'athlete', endpoint: '/api/platform/network', capability: 'platform.athlete.manage',
    inputFields: ['athleteId', 'patch', 'reason'],
    audit: { action: 'platform.athlete.updateProfile', targetCollection: 'athletes' },
    destination: '/admin/network', keywords: ['athlete', 'record', 'edit'],
  }),
  ...(['league', 'team', 'athlete'] as const).flatMap((entity) =>
    (['activate', 'suspend', 'archive', 'restore'] as const).map((action) => defineCommand({
      ...(action === 'archive' || action === 'suspend' ? consequential : regular),
      id: `network.${entity}.${action}`,
      label: `${action[0].toUpperCase()}${action.slice(1)} ${entity}`,
      description: `${action[0].toUpperCase()}${action.slice(1)} this ${entity} through its audited lifecycle.`,
      entity,
      endpoint: '/api/platform/network',
      capability: entity === 'athlete' ? 'platform.athlete.manage' : 'platform.network.manage',
      inputFields: ['id', 'reason'],
      audit: { action: `platform.network.${action}${entity}`, targetCollection: `${entity}s` },
      destination: '/admin/network',
      keywords: [entity, action, 'lifecycle'],
    })),
  ),
  /*
   * Merging is governed rather than consequential.
   *
   * It archives a real record and repoints live references, and while nothing is destroyed,
   * undoing it means restoring the absorbed record and moving every reference back by hand.
   * The typed confirmation is the friction that stops a mis-selected survivor.
   */
  ...(['team', 'athlete'] as const).map((entity) => defineCommand({
    ...governed('type:MERGE'),
    id: `network.${entity}.merge`,
    label: `Merge duplicate ${entity}`,
    description:
      `Absorb a duplicate ${entity} into the record that survives. Forward references move; `
      + 'official results stay attached to the record that earned them and read through the '
      + 'merge pointer.',
    entity,
    endpoint: '/api/platform/network',
    capability: entity === 'athlete' ? 'platform.athlete.manage' : 'platform.network.manage',
    inputFields: ['duplicateId', 'survivorId', 'allowCrossLeague', 'reason'],
    audit: { action: `platform.network.merge${entity}`, targetCollection: `${entity}s` },
    destination: '/admin/network',
    keywords: [entity, 'merge', 'duplicate', 'collapse'],
  })),
  defineCommand({
    ...governed('type:DELETE DRAFT'),
    id: 'network.draft.hard_delete', label: 'Delete unused draft', description: 'Permanently delete a draft only when no dependency has ever attached.',
    entity: 'platform', endpoint: '/api/platform/network', capability: 'platform.network.manage',
    inputFields: ['kind', 'id', 'reason', 'typedConfirmation'],
    audit: { action: 'platform.network.deleteDraft', targetCollection: 'network object' },
    destination: '/admin/network', keywords: ['delete', 'draft', 'dependency'],
  }),
  defineCommand({
    ...consequential,
    id: 'site.update_settings', label: 'Publish site settings', description: 'Change public copy, registration windows, or feature visibility.',
    entity: 'platform', endpoint: '/api/platform/site', capability: 'platform.site.manage',
    inputFields: ['expectedVersion', 'patch', 'reason'],
    audit: { action: 'platform.site.updateSettings', targetCollection: 'platformSettings' },
    destination: '/admin/platform', keywords: ['site', 'settings', 'registration', 'banner'],
  }),
  defineCommand({
    ...governed('type:SET FLOOR'),
    id: 'integrity.capture_policy_floor.set', label: 'Tighten capture-policy floor', description: 'Raise the minimum capture policy applied when future fixtures are created.',
    entity: 'platform', endpoint: '/api/platform/capture-policy-floor', capability: 'platform.admin.manage',
    inputFields: ['proposedFloor', 'expectedVersion', 'reason', 'typedConfirmation'],
    audit: { action: 'platform.integrity.capture_policy_floor_changed', targetCollection: 'platformSettings' },
    destination: '/admin/integrity', keywords: ['capture', 'policy', 'floor', 'field required'],
  }),
  defineCommand({
    ...governed('type:OPEN BETA OR PRODUCTION'),
    id: 'environment.activation.open', label: 'Open environment activation', description: 'Open a governed activation record; this does not move traffic.',
    entity: 'activation', endpoint: '/api/platform/environment-activation', capability: 'platform.environment.activate',
    inputFields: ['environment', 'reason', 'typedConfirmation'],
    audit: { action: 'environment.activation.opened', targetCollection: 'environmentActivations' },
    destination: '/admin/platform', keywords: ['environment', 'beta', 'production', 'activation'],
  }),
  ...(['record_readiness', 'approve', 'request_maintenance', 'issue_routing_instruction', 'confirm_smoke', 'complete', 'abandon'] as const)
    .map((action) => defineCommand({
      ...governed(`type:${action.replaceAll('_', ' ').toUpperCase()}`),
      id: `environment.activation.${action}`,
      label: action.replaceAll('_', ' ').replace(/^./, (value) => value.toUpperCase()),
      description: 'Advance an environment activation through its server-checked governance state machine.',
      entity: 'activation',
      endpoint: '/api/platform/environment-activation',
      capability: 'platform.environment.activate',
      inputFields: ['requestId', 'note', 'typedConfirmation'],
      audit: { action: `environment.activation.${action}`, targetCollection: 'environmentActivations' },
      destination: '/admin/platform',
      keywords: ['environment', 'activation', action],
    })),
  defineCommand({
    ...consequential,
    id: 'integrity.case.transition', label: 'Move integrity case', description: 'Acknowledge, escalate, or close an operational case without changing the sporting record.',
    entity: 'exception', endpoint: '/api/platform/competition-integrity', capability: 'platform.trust.decide',
    inputFields: ['exceptionId', 'status', 'note'],
    audit: { action: 'competition_integrity.status', targetCollection: 'reconciliationExceptions' },
    destination: '/admin/integrity', keywords: ['integrity', 'exception', 'escalate'],
  }),
  defineCommand({
    ...governed('type:RATIFY'),
    id: 'integrity.exception.ratify', label: 'Ratify exception resolution', description: 'Accept or override a proposed resolution when the operator is unconflicted.',
    entity: 'exception', endpoint: '/api/exceptions/:exceptionId/ratify', capability: 'platform.admin.manage',
    inputFields: ['exceptionId', 'decision', 'resolution', 'note', 'typedConfirmation'],
    audit: { action: 'match_exception_ratified', targetCollection: 'matchOperationalExceptions' },
    destination: '/admin/integrity', keywords: ['ratify', 'resolution', 'conflict'],
  }),
  defineCommand({
    ...governed('type:TAKE OVER'),
    id: 'integrity.match.force_takeover', label: 'Start fenced takeover', description: 'Create a new attributed Match Ops generation and fence the previous session.',
    entity: 'match', endpoint: '/api/matches/:matchId/takeover', capability: 'platform.admin.manage',
    inputFields: ['matchId', 'reason', 'typedConfirmation'],
    audit: { action: 'match_ops_takeover', targetCollection: 'matchOpsSessions' },
    destination: '/admin/integrity', keywords: ['match', 'live', 'takeover', 'fence'],
  }),
  ...(['approved', 'rejected'] as const).map((decision) => defineCommand({
    ...consequential,
    id: `media.${decision === 'approved' ? 'approve' : 'reject'}`,
    label: `${decision === 'approved' ? 'Approve' : 'Reject'} media`,
    description: decision === 'approved' ? 'Publish reviewed media.' : 'Reject media and remove its stored object.',
    entity: 'media', endpoint: '/api/platform/media', capability: 'platform.admin.manage',
    inputFields: ['mediaRecordId', 'decision', 'note'],
    audit: { action: `platform.media.${decision}`, targetCollection: 'mediaRecords' },
    destination: '/admin/integrity', keywords: ['media', 'moderation', decision],
  })),
  ...(['invite', 'submit', 'verify', 'reject', 'suspend', 'reinstate'] as const).map((action) => defineCommand({
    ...(action === 'verify' || action === 'suspend' ? consequential : regular),
    id: `payee.${action}`,
    label: `${action[0].toUpperCase()}${action.slice(1)} payee`,
    description: 'Advance the redacted athlete payout identity through its audited workflow.',
    entity: 'payee', endpoint: '/api/platform/payee', capability: 'platform.payee.verify',
    inputFields: action === 'submit'
      ? ['athleteId', 'payoutDetails', 'evidenceRefs', 'note']
      : ['athleteId', 'note'],
    audit: { action: `platform.payee.${action}`, targetCollection: 'athletePayees' },
    destination: '/admin/money', keywords: ['athlete', 'money', 'payee', action],
  })),
  defineCommand({
    ...governed('type:APPROVE'),
    id: 'application.approve_and_invite', label: 'Approve and invite league owner', description: 'Atomically create the organization, league, season, owner invitation, and audit record.',
    entity: 'application', endpoint: '/api/access', capability: 'platform.application.review',
    inputFields: ['applicationId', 'typedConfirmation'],
    audit: { action: 'approved_league_admin_application', targetCollection: 'leagueAdminApplications' },
    destination: '/admin', keywords: ['application', 'approve', 'invite', 'league'],
  }),
  defineCommand({
    ...consequential,
    id: 'application.review', label: 'Record application decision', description: 'Reject an application or request named missing information.',
    entity: 'application', endpoint: '/api/platform/applications/:applicationId', capability: 'platform.application.review',
    inputFields: ['applicationId', 'decision', 'missingFields', 'message', 'reason'],
    audit: { action: 'application_reviewed', targetCollection: 'leagueAdminApplications' },
    destination: '/admin', keywords: ['application', 'review', 'information', 'reject'],
  }),
  defineCommand({
    ...consequential,
    id: 'invitation.resend', label: 'Resend invitation', description: 'Rotate the invitation token and create an observable provider delivery attempt.',
    entity: 'assignment', endpoint: '/api/platform/invitations/:invitationId', capability: 'platform.access.manage',
    inputFields: ['invitationId', 'channel', 'reason'],
    audit: { action: 'access.invitation.resend_queued', targetCollection: 'invitations' },
    destination: '/admin/network', keywords: ['invitation', 'delivery', 'resend', 'email'],
  }),
  defineCommand({
    ...governed('type:REVOKE'),
    id: 'invitation.revoke', label: 'Revoke invitation', description: 'Invalidate an unaccepted invitation and preserve its delivery history.',
    entity: 'assignment', endpoint: '/api/platform/invitations/:invitationId', capability: 'platform.access.manage',
    inputFields: ['invitationId', 'reason', 'typedConfirmation'],
    audit: { action: 'access.invitation.revoked', targetCollection: 'invitations' },
    destination: '/admin/network', keywords: ['invitation', 'revoke', 'access'],
  }),
  defineCommand({
    ...governed('type:SEND BATCH'),
    id: 'invitation.bulk_resend', label: 'Send invitation batch', description: 'Validate and resend up to 100 existing invitations with per-row provider results.',
    entity: 'assignment', endpoint: '/api/platform/invitations/bulk', capability: 'platform.access.manage',
    inputFields: ['rows', 'reason', 'typedConfirmation'],
    audit: { action: 'access.invitation.bulk_resend', targetCollection: 'invitationDeliveryAttempts' },
    destination: '/admin/network', keywords: ['invitation', 'bulk', 'csv', 'delivery'],
  }),
  defineCommand({
    ...consequential,
    id: 'account.lifecycle', label: 'Change account lifecycle', description: 'Activate, suspend, disable, or mark an operator account for deletion.',
    entity: 'person', endpoint: '/api/admin/actions', capability: 'platform.accounts.lifecycle',
    inputFields: ['userId', 'status', 'reason'],
    audit: { action: 'account_lifecycle_changed', targetCollection: 'users' },
    destination: '/admin/network', keywords: ['person', 'account', 'suspend', 'disable'],
  }),
  defineCommand({
    ...consequential,
    id: 'access.assignment.transition', label: 'Change assignment lifecycle', description: 'Suspend, expire, reactivate, or revoke a canonical access assignment.',
    entity: 'assignment', endpoint: '/api/admin/actions', capability: 'platform.access.manage',
    inputFields: ['assignmentId', 'status', 'reason'],
    audit: { action: 'access_assignment_transitioned', targetCollection: 'accessAssignments' },
    destination: '/admin/network', keywords: ['access', 'assignment', 'revoke', 'suspend'],
  }),
  defineCommand({
    ...consequential,
    id: 'trust.report.resolve', label: 'Resolve trust report', description: 'Resolve or dismiss a trust report with a recorded decision note.',
    entity: 'report', endpoint: '/api/admin/actions', capability: 'platform.trust.decide',
    inputFields: ['reportId', 'decision', 'reason'],
    audit: { action: 'trust_report_resolved', targetCollection: 'reports' },
    destination: '/admin/integrity', keywords: ['trust', 'report', 'resolve', 'dismiss'],
  }),
] satisfies readonly PlatformCommandDefinition[];

export type PlatformCommandId = (typeof PLATFORM_COMMANDS)[number]['id'];

const commandById = new Map<string, PlatformCommandDefinition>(
  PLATFORM_COMMANDS.map((command) => [command.id, command]),
);

export function platformCommand(commandId: string): PlatformCommandDefinition | null {
  return commandById.get(commandId) ?? null;
}

export function platformCommandsFor(destination: PlatformCommandDefinition['destination']) {
  return PLATFORM_COMMANDS.filter((command) => command.destination === destination);
}

/**
 * The concrete URL for a command, with any `:param` segments filled from `params`.
 *
 * Registry endpoints are templates because several commands address a specific record in
 * their path. Resolving here keeps the substitution in one place: a caller that builds the
 * URL itself is a second answer to "where does this command go", and the two diverge the
 * first time an endpoint moves. Returns null when a required segment has no value, so a
 * caller cannot accidentally POST to a literal `/:exceptionId/`.
 */
export function resolvePlatformCommandEndpoint(
  command: PlatformCommandDefinition,
  params: Record<string, string | undefined> = {},
): string | null {
  let missing = false;
  const resolved = command.endpoint.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, (_match, name: string) => {
    const value = params[name];
    if (!value) { missing = true; return ''; }
    return encodeURIComponent(value);
  });
  return missing ? null : resolved;
}
