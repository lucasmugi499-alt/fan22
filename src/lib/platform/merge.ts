/**
 * Collapsing a duplicate club or athlete, without rewriting the sporting record.
 *
 * Duplicates are the defining data problem of grassroots sport. The same club gets registered
 * twice under two spellings; the same athlete is entered by two different team secretaries. Left
 * alone, a league table double-counts, a career passport is split across two identities, and a
 * fan following one of them sees half a season.
 *
 * ## Why this is a redirect and not a rewrite
 *
 * The obvious implementation moves every historical row from the duplicate onto the survivor.
 * That is exactly what this platform must never do. An official result and its events are
 * immutable, and a match played by `team_a` was played by `team_a` — reassigning it to
 * `team_b` would silently restate a fact nobody re-verified, and it would do so through an
 * admin tool rather than through the finalizer that owns official records.
 *
 * So a merge here does two separable things:
 *
 *   - **Forward references move.** Roster membership, contacts, and anything not yet played
 *     point at the survivor from now on.
 *   - **History stays put, and gains a pointer.** The duplicate is archived and marked
 *     `mergedInto`, so every historical record still resolves, and every surface that walks a
 *     career or a club history follows the pointer to present one continuous story.
 *
 * The reader sees one club. The ledger still says what actually happened. That is the only
 * reading of "merge" this platform can honestly offer, and the refusals below exist to keep it.
 */

export type MergeKind = 'team' | 'athlete';

/**
 * What is attached to the record being absorbed, counted at the moment of the decision.
 *
 * Counted rather than read from a stored aggregate, for the same reason lifecycle counts them:
 * a drifting `matchesCount` here would mean approving a merge on evidence that is not true.
 */
export type MergeDependencies = {
  /** Results already published as official. These never move. */
  officialMatches: number;
  /** Fixtures not yet played, which do move to the survivor. */
  scheduledMatches: number;
  /** Roster membership that moves. */
  athletes: number;
  /** Money attached to the duplicate. */
  payments: number;
  /** Live access assignments naming the duplicate. */
  activeAssignments: number;
};

export const NO_MERGE_DEPENDENCIES: MergeDependencies = {
  officialMatches: 0,
  scheduledMatches: 0,
  athletes: 0,
  payments: 0,
  activeAssignments: 0,
};

export type MergeSubject = {
  id: string;
  name: string;
  /** `archived` cannot absorb, and cannot be absorbed twice. */
  lifecycleState: 'draft' | 'active' | 'suspended' | 'archived';
  /** Set once this record has already been absorbed by another. */
  mergedIntoId?: string | null;
  /** Leagues for a team; the governing league for an athlete. */
  leagueId?: string | null;
};

export type MergeRefusal = {
  ok: false;
  /** Names the blocking condition rather than a bare denial. */
  reason: string;
};

export type MergePlan = {
  ok: true;
  kind: MergeKind;
  /** The record being absorbed. Archived, never deleted. */
  duplicateId: string;
  /** The record that survives. */
  survivorId: string;
  /** Forward-looking references that will be repointed. */
  moves: Array<{ what: string; count: number }>;
  /** Records that deliberately stay where they are. */
  preserved: Array<{ what: string; count: number }>;
  /** Shown before the operator confirms. */
  notices: string[];
};

export type MergeDecision = MergePlan | MergeRefusal;

function refuse(reason: string): MergeRefusal {
  return { ok: false, reason };
}

/**
 * Decides whether a merge may proceed, and states exactly what it would do.
 *
 * Every refusal names the condition that produced it. An operator told only "cannot merge"
 * goes looking for a workaround; an operator told "the survivor is archived" fixes the
 * survivor.
 */
export function planMerge({
  kind,
  duplicate,
  survivor,
  dependencies,
  allowCrossLeague = false,
}: {
  kind: MergeKind;
  duplicate: MergeSubject;
  survivor: MergeSubject;
  dependencies: MergeDependencies;
  /**
   * Merging across leagues is possible but never implicit.
   *
   * Two clubs of the same name in different leagues are usually two clubs. Requiring the
   * operator to say so out loud keeps the common case safe.
   */
  allowCrossLeague?: boolean;
}): MergeDecision {
  if (!duplicate.id || !survivor.id) {
    return refuse('Both records must be identified before they can be merged.');
  }
  if (duplicate.id === survivor.id) {
    return refuse('A record cannot be merged into itself.');
  }
  if (duplicate.mergedIntoId) {
    return refuse(
      `This record was already merged into ${duplicate.mergedIntoId}. Merge that record instead.`,
    );
  }
  if (survivor.mergedIntoId) {
    return refuse(
      `The survivor was itself merged into ${survivor.mergedIntoId}. Merge into that record instead.`,
    );
  }
  if (survivor.lifecycleState === 'archived') {
    return refuse('The survivor is archived. Restore it first, or choose a different survivor.');
  }
  if (duplicate.lifecycleState === 'archived') {
    return refuse('This record is already archived, so there is nothing live to merge.');
  }
  /*
   * The duplicate must be the one with no official history where that is avoidable. When both
   * carry official results the merge is still allowed — that is the real duplicate-club case —
   * but the operator is told plainly that the history will not be combined.
   */
  if (!allowCrossLeague && duplicate.leagueId && survivor.leagueId
    && duplicate.leagueId !== survivor.leagueId) {
    return refuse(
      `These records belong to different leagues (${duplicate.leagueId} and ${survivor.leagueId}). `
      + 'Two clubs of the same name in different leagues are usually two clubs; confirm a '
      + 'cross-league merge explicitly if that is genuinely what this is.',
    );
  }

  const moves: MergePlan['moves'] = [];
  const preserved: MergePlan['preserved'] = [];
  const notices: string[] = [];

  if (dependencies.athletes > 0) {
    moves.push({ what: kind === 'team' ? 'Roster members' : 'Linked records', count: dependencies.athletes });
  }
  if (dependencies.scheduledMatches > 0) {
    moves.push({ what: 'Scheduled fixtures', count: dependencies.scheduledMatches });
  }
  if (dependencies.activeAssignments > 0) {
    moves.push({ what: 'Active access assignments', count: dependencies.activeAssignments });
  }

  if (dependencies.officialMatches > 0) {
    preserved.push({ what: 'Official results', count: dependencies.officialMatches });
    notices.push(
      `${dependencies.officialMatches} official ${dependencies.officialMatches === 1 ? 'result stays' : 'results stay'} `
      + `attached to ${duplicate.name}, because an official record cannot be reattributed. `
      + `They will read as ${survivor.name} history through the merge pointer.`,
    );
  }
  if (dependencies.payments > 0) {
    preserved.push({ what: 'Payments', count: dependencies.payments });
    notices.push(
      `${dependencies.payments} ${dependencies.payments === 1 ? 'payment stays' : 'payments stay'} `
      + 'attached to the absorbed record. Money is never reassigned by a merge.',
    );
  }

  notices.push(
    `${duplicate.name} will be archived and marked as merged into ${survivor.name}. `
    + 'It is not deleted, and every existing link to it keeps resolving.',
  );

  return {
    ok: true,
    kind,
    duplicateId: duplicate.id,
    survivorId: survivor.id,
    moves,
    preserved,
    notices,
  };
}

/**
 * Follows a merge pointer to the record that should be displayed.
 *
 * Bounded rather than recursive-until-done: a cycle written by a bug would otherwise hang
 * every surface that resolves an identity. Returns the last id reached, so a broken chain
 * degrades to showing *something* real rather than throwing.
 */
export function resolveMergedId(
  startId: string,
  mergedInto: ReadonlyMap<string, string>,
  maxHops = 8,
): string {
  let current = startId;
  const seen = new Set<string>([current]);
  for (let hop = 0; hop < maxHops; hop += 1) {
    const next = mergedInto.get(current);
    if (!next || seen.has(next)) return current;
    seen.add(next);
    current = next;
  }
  return current;
}

/**
 * The fields written onto the absorbed record.
 *
 * Kept as one function so every caller writes the same shape; a merge that recorded its
 * pointer differently in two places would be a merge that some surfaces could not follow.
 */
export function mergeArchivePatch({
  survivorId,
  actorUserId,
  reason,
  at,
}: {
  survivorId: string;
  actorUserId: string;
  reason: string;
  at: string;
}) {
  return {
    lifecycleStatus: 'archived' as const,
    mergedIntoId: survivorId,
    mergedByUserId: actorUserId,
    mergedReason: reason,
    mergedAt: at,
  };
}
