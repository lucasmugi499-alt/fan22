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

  /**
   * The value INSIDE one scorer entry, and inside one stat.
   *
   * Capping list lengths alone left the dangerous half open. The finalizer expands football
   * and rugby scoring one event per point, and most stats one event per unit, so a single
   * well-formed entry reading `{ athleteId, teamId, count: 100000000 }` passes every length
   * check and then asks the finalizer to construct a hundred million objects — before
   * reconciliation, before the transaction, before any guard that could refuse it. One small
   * document becomes a CPU and memory exhaustion primitive available to any result submitter.
   */
  maxScorerCount: 100,
  maxStatValue: 500,
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
  for (const scorer of scorers ?? []) {
    const count = (scorer as { count?: unknown })?.count;
    const problem = numericProblem(count, SUBMISSION_LIMITS.maxScorerCount);
    if (problem) breaches.push(`scorer count ${problem}`);
  }

  const statLines = asArray(submission.athleteStatLines);
  if (statLines && statLines.length > SUBMISSION_LIMITS.maxStatLines) {
    breaches.push(`${statLines.length} stat lines exceeds the maximum of ${SUBMISSION_LIMITS.maxStatLines}.`);
  }
  for (const line of statLines ?? []) {
    const stats = (line as { stats?: unknown })?.stats;
    if (!stats || typeof stats !== 'object' || Array.isArray(stats)) continue;
    for (const [statKey, value] of Object.entries(stats as Record<string, unknown>)) {
      const problem = numericProblem(value, SUBMISSION_LIMITS.maxStatValue);
      if (problem) breaches.push(`stat ${statKey} ${problem}`);
    }
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
 * Whether a claimed numeric value is usable, and what is wrong with it if not.
 *
 * Checks the whole family at once — non-numeric, NaN, Infinity, negative, fractional, and
 * simply too large — because each of them reaches the expansion loop differently and only
 * one of them looks like an attack. A fractional or NaN value is a bug in a client; an
 * enormous one is the amplification primitive.
 */
function numericProblem(value: unknown, maximum: number): string | null {
  if (typeof value !== 'number') return `must be a number, received ${typeof value}.`;
  if (!Number.isFinite(value)) return 'must be finite.';
  if (!Number.isInteger(value)) return `must be a whole number, received ${value}.`;
  if (value < 0) return `cannot be negative, received ${value}.`;
  if (value > maximum) return `of ${value} exceeds the maximum of ${maximum}.`;
  return null;
}

/**
 * How many events this submission would expand into, counted without building any of them.
 *
 * The finalizer materialises one event per point for football and rugby, one per stat unit,
 * and one per squad member, then writes projections on top. Working that total out from the
 * claim is cheap; discovering it by constructing the array is the failure mode.
 */
export function projectedFinalizationWrites(
  submission: SubmissionShape,
  sport: 'football' | 'basketball' | 'rugby',
): number {
  const asArray = (value: unknown) => (Array.isArray(value) ? value : []);
  let planned = 0;

  for (const scorer of asArray(submission.scorers)) {
    const count = Number((scorer as { count?: unknown })?.count ?? 0);
    if (!Number.isFinite(count) || count < 0) continue;
    // Basketball carries the total on one variable-value event; the others expand per point.
    planned += sport === 'basketball' ? 1 : Math.trunc(count);
  }

  for (const line of asArray(submission.athleteStatLines)) {
    const stats = (line as { stats?: unknown })?.stats;
    if (!stats || typeof stats !== 'object' || Array.isArray(stats)) continue;
    for (const [statKey, value] of Object.entries(stats as Record<string, unknown>)) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) continue;
      planned += statKey === 'minutes_played' ? 1 : Math.trunc(numeric);
    }
  }

  const squads = submission.activeSquads;
  if (squads && typeof squads === 'object' && !Array.isArray(squads)) {
    for (const members of Object.values(squads as Record<string, unknown>)) {
      planned += asArray(members).length;
    }
  }

  // Reconciliation, provenance, standings and the per-athlete projections written after the
  // event fan-out. Counted as a flat allowance so the budget is about order of magnitude
  // rather than an exact ledger.
  return planned + 40;
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
