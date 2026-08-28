export type PlatformWorkbenchKind = 'league' | 'team' | 'athlete' | 'person' | 'match';

export type PlatformWorkbenchTab = {
  id: string;
  label: string;
  description: string;
};

export type PlatformForbiddenAction = {
  label: string;
  reason: string;
  alternative: string;
};

export type PlatformWorkbenchDefinition = {
  kind: PlatformWorkbenchKind;
  eyebrow: string;
  description: string;
  backHref: string;
  tabs: readonly PlatformWorkbenchTab[];
  commandIds: readonly string[];
  forbiddenActions: readonly PlatformForbiddenAction[];
};

const history: PlatformWorkbenchTab = {
  id: 'history',
  label: 'History',
  description: 'Immutable audit events and attributed state transitions.',
};

export const PLATFORM_WORKBENCHES = {
  league: {
    kind: 'league',
    eyebrow: 'League workbench',
    description: 'League identity, competition structure, accountability, quality and incidents.',
    backHref: '/admin/network?tab=leagues',
    tabs: [
      { id: 'overview', label: 'Overview', description: 'Identity, lifecycle and operating summary.' },
      { id: 'seasons', label: 'Seasons', description: 'Season structure and activation state.' },
      { id: 'teams', label: 'Teams', description: 'Member clubs and verification state.' },
      { id: 'accountability', label: 'Accountability', description: 'Responsible operators and assignments.' },
      { id: 'quality', label: 'Quality', description: 'Computed result-quality distribution and exceptions.' },
      { id: 'incidents', label: 'Incidents', description: 'Open operational and trust incidents.' },
      history,
    ],
    commandIds: ['network.league.activate', 'network.league.suspend', 'network.league.archive', 'network.league.restore'],
    forbiddenActions: [
      {
        label: 'Edit official result',
        reason: 'Official sporting facts are versioned and cannot be overwritten by Platform.',
        alternative: 'Request a governed result correction version.',
      },
      {
        label: 'Grant a capability',
        reason: 'Capabilities come from assignments and permission bundles.',
        alternative: 'Create or update the appropriate governed assignment.',
      },
    ],
  },
  team: {
    kind: 'team',
    eyebrow: 'Team workbench',
    description: 'Roster, administrators, fixtures, media and operational incidents.',
    backHref: '/admin/network?tab=teams',
    tabs: [
      { id: 'overview', label: 'Overview', description: 'Identity, lifecycle and operating summary.' },
      { id: 'roster', label: 'Roster', description: 'Athletes and their verification state.' },
      { id: 'administrators', label: 'Administrators', description: 'Active and invited team assignments.' },
      { id: 'fixtures', label: 'Fixtures', description: 'Scheduled and completed matches.' },
      { id: 'media', label: 'Media', description: 'Approved identity and roster media.' },
      { id: 'incidents', label: 'Incidents', description: 'Open operational and trust incidents.' },
      history,
    ],
    commandIds: ['network.team.activate', 'network.team.suspend', 'network.team.archive', 'network.team.restore'],
    forbiddenActions: [
      {
        label: 'Edit match events',
        reason: 'Live and finalized match events are owned by Match Ops and correction workflows.',
        alternative: 'Open the match workbench and request a correction version.',
      },
    ],
  },
  athlete: {
    kind: 'athlete',
    eyebrow: 'Athlete workbench',
    description: 'Canonical record, public persona, team link, verification and payee readiness.',
    backHref: '/admin/network?tab=athletes',
    tabs: [
      { id: 'record', label: 'Record', description: 'Canonical identity and lifecycle state.' },
      { id: 'persona', label: 'Persona', description: 'Public profile and approved media.' },
      { id: 'team', label: 'Team', description: 'Current team and roster relationship.' },
      { id: 'verification', label: 'Verification', description: 'Evidence and verification decisions.' },
      { id: 'payee', label: 'Payee', description: 'Redacted payout readiness and review status.' },
      history,
    ],
    commandIds: ['network.athlete.activate', 'network.athlete.suspend', 'network.athlete.archive', 'network.athlete.restore'],
    forbiddenActions: [
      {
        label: 'Edit athlete statistics',
        reason: 'Statistics are derived from attributed official event versions.',
        alternative: 'Request correction of the underlying official event version.',
      },
      {
        label: 'Reveal payee details',
        reason: 'Platform views expose payout readiness, not private banking credentials.',
        alternative: 'Route the case to the authorized payee verification workflow.',
      },
    ],
  },
  person: {
    kind: 'person',
    eyebrow: 'Person workbench',
    description: 'Account identity, assignments, organizations, security and support history.',
    backHref: '/admin/network?tab=people',
    tabs: [
      { id: 'overview', label: 'Overview', description: 'Account identity and current status.' },
      { id: 'assignments', label: 'Assignments', description: 'Governed role assignments and invitations.' },
      { id: 'organizations', label: 'Organizations', description: 'Linked organization responsibilities.' },
      { id: 'security', label: 'Security', description: 'Access version and observed security state.' },
      { id: 'cases', label: 'Cases', description: 'Open support and trust cases.' },
      history,
    ],
    commandIds: ['account.lifecycle'],
    forbiddenActions: [
      {
        label: 'Impersonate account',
        reason: 'Platform support never assumes another principal’s identity.',
        alternative: 'Open the labelled, read-only support view with audit attribution.',
      },
      {
        label: 'Edit capabilities',
        reason: 'Capabilities are resolved from governed assignments and bundles.',
        alternative: 'Change the relevant assignment through its governed workflow.',
      },
    ],
  },
  match: {
    kind: 'match',
    eyebrow: 'Match workbench',
    description: 'Live state, sessions, exceptions, provenance and immutable result history.',
    backHref: '/admin/integrity?tab=live',
    tabs: [
      { id: 'overview', label: 'Overview', description: 'Fixture identity and current operational state.' },
      { id: 'operations', label: 'Operations', description: 'Active capture sessions and assigned operators.' },
      { id: 'exceptions', label: 'Exceptions', description: 'Open operational and reconciliation exceptions.' },
      { id: 'quality', label: 'Quality', description: 'Computed finalization quality and evidence.' },
      { id: 'provenance', label: 'Provenance', description: 'Attributed event/result versions and generation chain.' },
      history,
    ],
    commandIds: ['integrity.match.force_takeover'],
    forbiddenActions: [
      {
        label: 'Edit live clock',
        reason: 'Platform cannot directly operate the live event stream or clock.',
        alternative: 'Create a fenced, attributed takeover session generation.',
      },
      {
        label: 'Set quality tier',
        reason: 'Data quality is computed and stored by the finalizer.',
        alternative: 'Resolve the evidence or exception that affects finalization quality.',
      },
      {
        label: 'Overwrite result',
        reason: 'Finalized sporting truth is immutable and versioned.',
        alternative: 'Request a governed correction or ratification workflow.',
      },
    ],
  },
} as const satisfies Record<PlatformWorkbenchKind, PlatformWorkbenchDefinition>;

export function getPlatformWorkbench(kind: string): PlatformWorkbenchDefinition | undefined {
  return kind in PLATFORM_WORKBENCHES ? PLATFORM_WORKBENCHES[kind as PlatformWorkbenchKind] : undefined;
}
