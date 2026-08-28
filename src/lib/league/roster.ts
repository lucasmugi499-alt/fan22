/**
 * Roster operations, and the line they must not cross.
 *
 * A League Admin owns registration: who is on a club's roster, what number they wear, what
 * position they are registered in, whether they are eligible this season. They do not own
 * performance. Goals, appearances, minutes and every official statistic are produced by the
 * finalizer from recorded events, and no roster operation may write one.
 *
 * That line is the whole reason this module exists as a field allowlist rather than a patch
 * object. A roster edit that accepted an arbitrary patch would be one careless caller away
 * from setting `goals`, and the difference between "the league manages its roster" and "the
 * league can type a career" is exactly this list.
 */

export type RosterAction =
  /** Change the registered squad number. */
  | 'set_number'
  /** Change the position the league registered them in. */
  | 'set_position'
  /** Move a registration to another club in the same league. */
  | 'transfer'
  /** Suspend a registration; the athlete stays on the roster and cannot be selected. */
  | 'suspend'
  /** Lift a suspension. */
  | 'reinstate'
  /** Take them off the active roster without deleting the record. */
  | 'deactivate';

/**
 * The only athlete fields a league roster operation may write.
 *
 * Every one is a registration fact. Nothing here is derived from a match, and nothing here
 * appears on a career record as a performance number.
 */
export const ROSTER_WRITABLE_FIELDS = [
  'teamId',
  'squadNumber',
  'registeredPosition',
  'rosterStatus',
] as const;

/**
 * Fields that must never be reachable from a roster operation.
 *
 * Listed explicitly and asserted in tests, so adding a new action cannot quietly widen what a
 * roster edit can touch.
 */
export const ROSTER_FORBIDDEN_FIELDS = [
  'goals',
  'assists',
  'appearances',
  'minutesPlayed',
  'goalPlacePoints',
  'verificationStatus',
  'officialResultVersion',
  'careerStats',
  'userId',
] as const;

export type RosterStatus = 'active' | 'suspended' | 'inactive';

export type RosterDecision =
  | { ok: false; reason: string }
  | { ok: true; patch: Record<string, string | number>; auditAction: string; summary: string };

export type RosterSubject = {
  athleteId: string;
  legalName: string;
  teamId: string;
  leagueId: string;
  rosterStatus?: RosterStatus;
  squadNumber?: number;
};

/**
 * Decides one roster operation, and produces exactly the fields it may write.
 *
 * Every refusal names its condition. A League Admin told only "not allowed" goes looking for
 * another route; one told "that number belongs to somebody else in this squad" fixes it.
 */
export function decideRosterAction({
  action,
  athlete,
  squadNumber,
  registeredPosition,
  toTeamId,
  reason,
  squad,
  leagueTeamIds,
}: {
  action: RosterAction;
  athlete: RosterSubject;
  squadNumber?: number;
  registeredPosition?: string;
  toTeamId?: string;
  reason?: string;
  /** Everyone currently registered to the club, for number and duplicate checks. */
  squad?: ReadonlyArray<{ athleteId: string; squadNumber?: number }>;
  /** Clubs in this league, so a transfer cannot leave it. */
  leagueTeamIds?: readonly string[];
}): RosterDecision {
  const status = athlete.rosterStatus ?? 'active';

  if (action === 'set_number') {
    if (!Number.isInteger(squadNumber) || (squadNumber as number) < 1 || (squadNumber as number) > 99) {
      return { ok: false, reason: 'A squad number is a whole number between 1 and 99.' };
    }
    const taken = (squad ?? []).find((member) =>
      member.athleteId !== athlete.athleteId && member.squadNumber === squadNumber);
    if (taken) {
      return { ok: false, reason: `Number ${squadNumber} already belongs to somebody in this squad.` };
    }
    return {
      ok: true,
      patch: { squadNumber: squadNumber as number },
      auditAction: 'league.roster.number_changed',
      summary: `${athlete.legalName} now wears ${squadNumber}.`,
    };
  }

  if (action === 'set_position') {
    const next = (registeredPosition ?? '').trim();
    if (next.length < 2) return { ok: false, reason: 'Choose a registered position.' };
    return {
      ok: true,
      patch: { registeredPosition: next },
      auditAction: 'league.roster.position_changed',
      summary: `${athlete.legalName} is registered as ${next}.`,
    };
  }

  if (action === 'transfer') {
    if (!toTeamId) return { ok: false, reason: 'Choose the club they are transferring to.' };
    if (toTeamId === athlete.teamId) {
      return { ok: false, reason: 'That is the club they are already registered to.' };
    }
    if (leagueTeamIds?.length && !leagueTeamIds.includes(toTeamId)) {
      return {
        ok: false,
        reason: 'That club is not in this league. A league can only move a registration inside its own competition.',
      };
    }
    if ((reason ?? '').trim().length < 4) {
      return { ok: false, reason: 'Give a reason. A transfer is recorded against both clubs.' };
    }
    return {
      ok: true,
      // The number does not travel: it belongs to the squad they are leaving.
      patch: { teamId: toTeamId, squadNumber: 0 },
      auditAction: 'league.roster.transferred',
      summary: `${athlete.legalName} transferred to another club in this league.`,
    };
  }

  if (action === 'suspend') {
    if (status === 'suspended') return { ok: false, reason: 'This registration is already suspended.' };
    if ((reason ?? '').trim().length < 4) {
      return { ok: false, reason: 'Give a reason. The athlete and their club are told why.' };
    }
    return {
      ok: true,
      patch: { rosterStatus: 'suspended' },
      auditAction: 'league.roster.suspended',
      summary: `${athlete.legalName} is suspended and cannot be selected.`,
    };
  }

  if (action === 'reinstate') {
    if (status !== 'suspended') return { ok: false, reason: 'This registration is not suspended.' };
    return {
      ok: true,
      patch: { rosterStatus: 'active' },
      auditAction: 'league.roster.reinstated',
      summary: `${athlete.legalName} is available for selection again.`,
    };
  }

  if (action === 'deactivate') {
    if (status === 'inactive') return { ok: false, reason: 'This registration is already inactive.' };
    return {
      ok: true,
      patch: { rosterStatus: 'inactive' },
      auditAction: 'league.roster.deactivated',
      summary:
        `${athlete.legalName} is off the active roster. Their record and match history are kept.`,
    };
  }

  return { ok: false, reason: 'Unknown roster action.' };
}

/**
 * Whether a patch stays inside what a roster operation may write.
 *
 * Belt and braces beside the decision function: the route asserts this before writing, so a
 * future action that returned an unexpected field is refused rather than trusted.
 */
export function patchIsRosterSafe(patch: Record<string, unknown>): boolean {
  const allowed = new Set<string>(ROSTER_WRITABLE_FIELDS);
  return Object.keys(patch).every((key) => allowed.has(key));
}

/** How a roster reads, split by the states a League Admin acts on. */
export function summariseRoster(
  members: ReadonlyArray<{ rosterStatus?: RosterStatus; verificationStatus?: string; userId?: string }>,
) {
  return {
    total: members.length,
    active: members.filter((member) => (member.rosterStatus ?? 'active') === 'active').length,
    suspended: members.filter((member) => member.rosterStatus === 'suspended').length,
    inactive: members.filter((member) => member.rosterStatus === 'inactive').length,
    registrationIssues: members.filter((member) =>
      member.verificationStatus === 'pending' || member.verificationStatus === 'disputed').length,
    unclaimed: members.filter((member) => !member.userId).length,
  };
}
