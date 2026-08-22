/**
 * What "delete" is allowed to mean.
 *
 * On this platform it almost always means archive. A league, team or athlete that ever
 * carried an official result is part of the sporting record, and the sporting record is the
 * product — removing the row would silently rewrite standings, appearance counts and career
 * history that fans and athletes have already seen. Archiving keeps the object readable and
 * out of the way; deleting destroys evidence.
 *
 * Hard delete survives for exactly one case: an object created by mistake that never became
 * real. "Never became real" is not a judgement call here, it is the absence of every
 * dependency below. If any one of them exists, the answer is archive, and the caller is told
 * which dependency decided it rather than being handed a bare refusal.
 */

export type LifecycleState = 'draft' | 'active' | 'suspended' | 'archived';

/** The lifecycle states an object can be in and still be operated on. */
export const LIVE_LIFECYCLE_STATES: LifecycleState[] = ['draft', 'active', 'suspended'];

export type LifecycleAction = 'activate' | 'suspend' | 'archive' | 'restore' | 'hard_delete';

/**
 * Everything that makes an object real, counted at the moment of the decision.
 *
 * Counted, never inferred from a stored flag: a `verified` boolean or a `matchesCount`
 * aggregate can drift, and drift here means destroying records the platform promised to keep.
 */
export type LifecycleDependencies = {
  /** Results that were published as official. The strongest possible reason to keep a row. */
  officialMatches: number;
  /** Any match at all, official or not — fixtures reference this object. */
  matches: number;
  /** Athlete profiles attached to this object. */
  athletes: number;
  /** Teams attached to this object (leagues only). */
  teams: number;
  /** Contributions, pledges or payouts. Money is never orphaned. */
  payments: number;
  /**
   * Audit entries naming this object, beyond the one recording its creation.
   *
   * The creation entry is excluded by the counter on purpose: everything is created with
   * one, so counting it would mean nothing ever qualified as "a draft with nothing
   * attached" and this rule would be decoration. See `networkDependencies`.
   */
  auditEvents: number;
};

export const NO_DEPENDENCIES: LifecycleDependencies = {
  officialMatches: 0,
  matches: 0,
  athletes: 0,
  teams: 0,
  payments: 0,
  auditEvents: 0,
};

export type LifecycleDecision =
  | { ok: true; nextState: LifecycleState }
  | { ok: false; reason: string; blockers: string[] };

/** One legal successor per action, so a state machine rather than a set of writes. */
const TRANSITIONS: Record<Exclude<LifecycleAction, 'hard_delete'>, { from: LifecycleState[]; to: LifecycleState }> = {
  activate: { from: ['draft', 'suspended'], to: 'active' },
  suspend: { from: ['draft', 'active'], to: 'suspended' },
  archive: { from: ['draft', 'active', 'suspended'], to: 'archived' },
  restore: { from: ['archived'], to: 'suspended' },
};

/**
 * Every dependency standing between this object and a hard delete, in plain words.
 *
 * Returned as a list rather than a boolean so an operator sees the whole picture at once.
 * Told only "it has matches", they would delete the matches and try again, and meet the
 * payments they were never shown.
 */
export function hardDeleteBlockers(
  state: LifecycleState,
  dependencies: LifecycleDependencies,
): string[] {
  const blockers: string[] = [];
  if (state !== 'draft') {
    blockers.push(`Only a draft can be deleted outright; this one is ${state}.`);
  }
  if (dependencies.officialMatches > 0) {
    blockers.push(`${dependencies.officialMatches} official result(s) reference it — the sporting record cannot be rewritten.`);
  }
  if (dependencies.matches > 0) {
    blockers.push(`${dependencies.matches} match(es) reference it.`);
  }
  if (dependencies.athletes > 0) {
    blockers.push(`${dependencies.athletes} athlete profile(s) belong to it.`);
  }
  if (dependencies.teams > 0) {
    blockers.push(`${dependencies.teams} team(s) belong to it.`);
  }
  if (dependencies.payments > 0) {
    blockers.push(`${dependencies.payments} payment record(s) reference it — money is never orphaned.`);
  }
  if (dependencies.auditEvents > 0) {
    blockers.push(`${dependencies.auditEvents} audit entr(ies) record activity on it beyond its creation.`);
  }
  return blockers;
}

export function decideLifecycleTransition(input: {
  action: LifecycleAction;
  state: LifecycleState;
  dependencies: LifecycleDependencies;
}): LifecycleDecision {
  if (input.action === 'hard_delete') {
    const blockers = hardDeleteBlockers(input.state, input.dependencies);
    if (blockers.length) {
      return {
        ok: false,
        // Names the alternative, because the operator's goal is "get this out of the way"
        // and archiving achieves it without destroying anything.
        reason: 'This object cannot be deleted outright. Archive it instead.',
        blockers,
      };
    }
    return { ok: true, nextState: 'archived' };
  }

  const transition = TRANSITIONS[input.action];
  if (!transition.from.includes(input.state)) {
    return {
      ok: false,
      reason: `Cannot ${input.action} an object that is ${input.state}.`,
      blockers: [],
    };
  }
  return { ok: true, nextState: transition.to };
}

/**
 * Restoring returns an object to `suspended`, never straight to `active`.
 *
 * Archiving is usually a response to something being wrong. Putting the object back in front
 * of the public in one click would republish whatever caused the archive; landing in
 * suspended forces a second, deliberate activation once someone has looked.
 */
export function isPubliclyVisible(state: LifecycleState) {
  return state === 'active';
}
