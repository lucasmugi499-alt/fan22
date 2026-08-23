/**
 * Hard ceilings on what one result submission may claim.
 *
 * The finalizer expands a submission into squad events, scoring events, stat-line events,
 * athlete projections, official events, reconciliation and standings — all inside one
 * transaction. Firestore transactions have a finite operation budget, so an unbounded input
 * is an unbounded write plan, and a write plan that exceeds the budget fails, retries, and
 * fails again. One oversized document becomes a permanently retrying trigger: cost, log
 * noise, and a match stuck out of official state.
 *
 * These caps exist so that cannot happen. They are deliberately generous — comfortably above
 * any real grassroots fixture — because their job is to stop amplification, not to referee
 * team sheets. Sport-specific realism belongs in submission validation, not here.
 *
 * Mirrored in firestore.rules.next. Rules stop the document being written at all; the
 * finalizer preflight stops a document that predates these limits from being expanded.
 */

export const SUBMISSION_LIMITS = {
  /** Two teams per fixture, so a third squad key is malformed rather than large. */
  maxSquadTeams: 2,
  /** Per team. A 40-player matchday squad is already far beyond grassroots reality. */
  maxSquadMembersPerTeam: 40,
  maxScorerEntries: 60,
  /** One line per participating athlete, both teams, with headroom. */
  maxStatLines: 120,
  maxEvidenceRefs: 20,
  /** Basketball scores legitimately reach three figures; nothing reaches four. */
  maxScore: 300,
} as const;

/**
 * The write budget a single finalization may plan.
 *
 * Well under Firestore's per-transaction limit, so a plan passing this check has room for
 * the reconciliation and standings writes that follow the event fan-out.
 */
export const MAX_FINALIZATION_WRITES = 400;

export type SubmissionShape = {
  homeScore?: unknown;
  awayScore?: unknown;
  scorers?: unknown;
  activeSquads?: unknown;
  athleteStatLines?: unknown;
  evidenceRefs?: unknown;
};

/**
 * Every limit this submission breaches, in plain words.
 *
 * Returned as a list rather than a boolean so an operator sees the whole shape of the
 * problem — a submission that is too large is usually wrong in more than one way.
 */
export function submissionLimitBreaches(submission: SubmissionShape): string[] {
  const breaches: string[] = [];
  const asArray = (value: unknown) => (Array.isArray(value) ? value : null);

  const scorers = asArray(submission.scorers);
  if (scorers && scorers.length > SUBMISSION_LIMITS.maxScorerEntries) {
    breaches.push(`${scorers.length} scorer entries exceeds the maximum of ${SUBMISSION_LIMITS.maxScorerEntries}.`);
  }

  const statLines = asArray(submission.athleteStatLines);
  if (statLines && statLines.length > SUBMISSION_LIMITS.maxStatLines) {
    breaches.push(`${statLines.length} stat lines exceeds the maximum of ${SUBMISSION_LIMITS.maxStatLines}.`);
  }

  const evidence = asArray(submission.evidenceRefs);
  if (evidence && evidence.length > SUBMISSION_LIMITS.maxEvidenceRefs) {
    breaches.push(`${evidence.length} evidence references exceeds the maximum of ${SUBMISSION_LIMITS.maxEvidenceRefs}.`);
  }

  const squads = submission.activeSquads;
  if (squads && typeof squads === 'object' && !Array.isArray(squads)) {
    const entries = Object.entries(squads as Record<string, unknown>);
    if (entries.length > SUBMISSION_LIMITS.maxSquadTeams) {
      breaches.push(`${entries.length} squads submitted; a fixture has ${SUBMISSION_LIMITS.maxSquadTeams}.`);
    }
    for (const [teamId, members] of entries) {
      const list = asArray(members);
      if (list && list.length > SUBMISSION_LIMITS.maxSquadMembersPerTeam) {
        breaches.push(`squad for ${teamId} has ${list.length} members, above the maximum of ${SUBMISSION_LIMITS.maxSquadMembersPerTeam}.`);
      }
    }
  }

  for (const [label, value] of [['home', submission.homeScore], ['away', submission.awayScore]] as const) {
    if (typeof value === 'number' && value > SUBMISSION_LIMITS.maxScore) {
      breaches.push(`${label} score of ${value} exceeds the maximum of ${SUBMISSION_LIMITS.maxScore}.`);
    }
  }

  return breaches;
}

/**
 * Whether a planned finalization is small enough to attempt.
 *
 * Checked before the transaction opens rather than discovered inside it. A plan that is too
 * large should become a reviewable data-quality exception, not a transaction that fails and
 * retries forever — the difference between a match a human can fix and a trigger nobody
 * notices is burning.
 */
export function finalizationWriteBudgetExceeded(plannedWrites: number): boolean {
  return plannedWrites > MAX_FINALIZATION_WRITES;
}
