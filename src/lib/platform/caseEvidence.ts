/**
 * The facts that decide a case, assembled for the card the operator is already reading.
 *
 * The Desk shipped with a `summary` per case kind — "Recorded events and the submitted score
 * disagree", "A managed athlete record needs verification evidence reviewed". Those are
 * category descriptions. They say what *kind* of thing this is, not what is true about *this
 * one*, so every decision still cost a page load to the entity and back. That round trip is
 * precisely what the Desk exists to remove.
 *
 * Everything below is read from fields the platform already stores. A match-ops submission
 * writes `detail.declared` and `detail.reconstructed`; a proposal writes `proposedResolution`
 * and the `conflictContext` that was true when it was written. None of it has ever been shown.
 *
 * Nothing here invents a fact. Where a field is absent the fact is omitted rather than
 * defaulted, because a confident zero on a decision surface is worse than a gap: the operator
 * cannot tell a real zero from a missing read, and this console's whole claim is that what it
 * displays is evidence.
 */

export type CaseFactTone = 'neutral' | 'good' | 'warn' | 'bad';

export type PlatformCaseFact = {
  label: string;
  value: string;
  tone?: CaseFactTone;
};

export type PlatformCaseProposal = {
  /** Who proposed it. A user id when no display name was stored; never blank. */
  by: string;
  resolution: string;
  at?: string;
};

export type PlatformCaseEvidence = {
  /** One sentence stating what is actually in dispute, in this case's own numbers. */
  headline: string;
  facts: PlatformCaseFact[];
  proposal?: PlatformCaseProposal;
  /** Why the obvious resolver cannot decide this themselves. */
  conflict?: string;
};

type Row = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A `{ home, away }` score, or null when either half is missing. */
function score(value: unknown): { home: number; away: number } | null {
  if (!value || typeof value !== 'object') return null;
  const home = num((value as Row).home);
  const away = num((value as Row).away);
  return home === null || away === null ? null : { home, away };
}

function formatScore(value: { home: number; away: number }) {
  return `${value.home}-${value.away}`;
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/**
 * A match-ops exception: what the field manager declared against what the events reconstruct.
 *
 * This is the case the redesign leads with, and every number in it is stored on the exception
 * document by the submission route.
 */
export function operationalExceptionEvidence(data: Row): PlatformCaseEvidence | undefined {
  const detail = (data.detail ?? {}) as Row;
  const declared = score(detail.declared);
  const reconstructed = score(detail.reconstructed);
  const unsynced = num(detail.unsyncedCount);
  const facts: PlatformCaseFact[] = [];

  if (declared) facts.push({ label: 'Field report declares', value: formatScore(declared) });
  if (reconstructed) {
    const disagrees = Boolean(declared)
      && (declared!.home !== reconstructed.home || declared!.away !== reconstructed.away);
    facts.push({
      label: 'Reconstructed events give',
      value: formatScore(reconstructed),
      tone: disagrees ? 'bad' : 'good',
    });
  }
  if (unsynced !== null && unsynced > 0) {
    facts.push({
      label: 'Events never synced',
      value: String(unsynced),
      tone: 'warn',
    });
  }

  const proposal = proposalFrom(data);
  const conflict = conflictFrom(data);

  let headline: string;
  if (declared && reconstructed) {
    const disagrees = declared.home !== reconstructed.home || declared.away !== reconstructed.away;
    headline = disagrees
      ? `The field report says ${formatScore(declared)}; the recorded events reconstruct to ${formatScore(reconstructed)}.`
      : `The field report and the recorded events agree at ${formatScore(declared)}.`;
  } else if (unsynced !== null && unsynced > 0) {
    headline = `${unsynced} ${unsynced === 1 ? 'event' : 'events'} from this match never reached the server.`;
  } else if (!facts.length && !proposal && !conflict) {
    // Nothing stored to show. Say nothing rather than dress up the absence.
    return undefined;
  } else {
    headline = 'This match operation needs an attributed resolution.';
  }

  return { headline, facts, ...(proposal ? { proposal } : {}), ...(conflict ? { conflict } : {}) };
}

/**
 * The proposal a league already recorded, shown verbatim.
 *
 * "Jane K. proposed: uphold 3-1" is the difference between a queue item and a decision. A
 * ratification where the operator cannot see what they are ratifying is a rubber stamp.
 */
function proposalFrom(data: Row): PlatformCaseProposal | undefined {
  const resolution = str(data.proposedResolution);
  if (!resolution) return undefined;
  return {
    by: str(data.proposedByDisplayName) ?? str(data.proposedByUserId) ?? 'A league admin',
    resolution,
    ...(str(data.proposedAt) ? { at: str(data.proposedAt)! } : {}),
  };
}

/**
 * Why the league could not resolve this itself.
 *
 * The conflict context is stored at proposal time deliberately, so a reviewer weeks later
 * reads the state that was true when the proposal was written rather than the state now.
 */
function conflictFrom(data: Row): string | undefined {
  const context = (data.conflictContext ?? {}) as Row;
  if (context.conflictWithMatch !== true) return undefined;
  const teams = list(context.affiliatedTeamIds);
  const basis = str(context.basis);
  const relationships = list(context.relationships);
  const detail = basis ?? (relationships.length ? relationships.join(', ') : null);
  const scope = teams.length === 1
    ? 'a club in this match'
    : teams.length > 1
      ? `${teams.length} clubs in this match`
      : 'this match';
  return detail
    ? `The proposing admin has a declared tie to ${scope} (${detail}), so they cannot ratify their own proposal.`
    : `The proposing admin has a declared tie to ${scope}, so they cannot ratify their own proposal.`;
}

/**
 * A reconciliation exception, which is the same disagreement seen from the finalizer's side.
 */
export function reconciliationExceptionEvidence(data: Row): PlatformCaseEvidence | undefined {
  const eventScore = score(data.eventScore);
  const officialScore = score(data.officialScore ?? data.submittedScore);
  const unattributed = num(data.unattributed);
  const issues = list(data.issues);
  const facts: PlatformCaseFact[] = [];

  if (officialScore) facts.push({ label: 'Submitted score', value: formatScore(officialScore) });
  if (eventScore) {
    facts.push({
      label: 'Events reconstruct to',
      value: formatScore(eventScore),
      tone: officialScore
        && (officialScore.home !== eventScore.home || officialScore.away !== eventScore.away)
        ? 'bad'
        : 'good',
    });
  }
  if (unattributed !== null && unattributed > 0) {
    facts.push({ label: 'Unattributed scoring', value: String(unattributed), tone: 'warn' });
  }
  for (const issue of issues.slice(0, 3)) {
    facts.push({ label: 'Issue', value: issue.replaceAll('_', ' '), tone: 'warn' });
  }

  if (!facts.length) return undefined;

  const headline = officialScore && eventScore
    && (officialScore.home !== eventScore.home || officialScore.away !== eventScore.away)
    ? `Submitted ${formatScore(officialScore)} against ${formatScore(eventScore)} reconstructed from events. No official record was published.`
    : 'The recorded events and the submitted result did not reconcile, so nothing was published.';

  return { headline, facts };
}

/**
 * A league application, with the risk signals that were computed at intake.
 */
export function applicationEvidence(data: Row): PlatformCaseEvidence | undefined {
  const facts: PlatformCaseFact[] = [];
  const sport = str(data.sport);
  const region = str(data.region ?? data.city);
  const teams = num(data.estimatedTeamCount ?? data.teamCount);
  const applicant = str(data.applicantName ?? data.contactName);
  const flags = list(data.riskFlags);

  if (applicant) facts.push({ label: 'Applicant', value: applicant });
  if (sport || region) {
    facts.push({ label: 'Competition', value: [sport, region].filter(Boolean).join(' · ') });
  }
  if (teams !== null) facts.push({ label: 'Estimated clubs', value: String(teams) });
  for (const flag of flags.slice(0, 4)) {
    facts.push({ label: 'Risk flag', value: flag.replaceAll('_', ' '), tone: 'warn' });
  }
  if (data.duplicateRisk === true) {
    const duplicate = str(data.duplicateOfLeagueName ?? data.duplicateOfLeagueId);
    facts.push({
      label: 'Possible duplicate of',
      value: duplicate ?? 'an existing league',
      tone: 'bad',
    });
  }

  if (!facts.length) return undefined;

  const headline = flags.length
    ? `${flags.length} risk ${flags.length === 1 ? 'flag was' : 'flags were'} raised at intake.`
    : 'No risk flags were raised at intake.';

  return { headline, facts };
}

/**
 * A payee verification, which attests that payout details belong to the named athlete.
 */
export function payeeEvidence(data: Row): PlatformCaseEvidence | undefined {
  const facts: PlatformCaseFact[] = [];
  const channel = str(data.channel ?? data.destinationType);
  const nameOnAccount = str(data.nameOnAccount ?? data.accountName);
  const registeredName = str(data.registeredName ?? data.athleteLegalName);
  const heldLabel = str(data.heldAmountLabel);

  if (channel) facts.push({ label: 'Destination', value: channel });
  if (nameOnAccount) facts.push({ label: 'Name on account', value: nameOnAccount });
  if (registeredName) {
    const matches = nameOnAccount !== null
      && nameOnAccount.toLowerCase() === registeredName.toLowerCase();
    facts.push({
      label: 'Registered name',
      value: registeredName,
      tone: nameOnAccount === null ? 'neutral' : matches ? 'good' : 'bad',
    });
  }
  /*
   * A held total is shown only when the source stored a formatted label. Fantasy and payout
   * money are never reformatted here: a currency rendered by the wrong layer is how a figure
   * comes to disagree with the ledger that owns it.
   */
  if (heldLabel) facts.push({ label: 'Held pending attestation', value: heldLabel, tone: 'warn' });

  if (!facts.length) return undefined;

  const headline = nameOnAccount && registeredName
    ? nameOnAccount.toLowerCase() === registeredName.toLowerCase()
      ? 'The name on the account matches the registered name.'
      : 'The name on the account does not match the registered name.'
    : 'Payout details are waiting for an attestation.';

  return { headline, facts };
}

/**
 * A trust report.
 */
export function trustEvidence(data: Row): PlatformCaseEvidence | undefined {
  const facts: PlatformCaseFact[] = [];
  const severity = str(data.severity);
  const category = str(data.category ?? data.reportType);
  const reported = str(data.reportedEntity);
  const affected = str(data.affectedEntity);

  if (category) facts.push({ label: 'Category', value: category });
  if (severity) {
    facts.push({
      label: 'Severity',
      value: severity,
      tone: /critical/i.test(severity) ? 'bad' : /high/i.test(severity) ? 'warn' : 'neutral',
    });
  }
  if (reported) facts.push({ label: 'Reported', value: reported });
  if (affected && affected !== reported) facts.push({ label: 'Affects', value: affected });

  if (!facts.length) return undefined;
  return { headline: str(data.summary) ?? 'A trust report is waiting for a decision.', facts };
}

/**
 * A league waiting on verification, described by what it already is.
 *
 * Distinct from an application, which is a request to create something. This case is a league
 * that exists and wants its status raised, so the facts that decide it are its actual size and
 * activity rather than an applicant's claims.
 */
export function leagueVerificationEvidence(data: Row): PlatformCaseEvidence | undefined {
  const facts: PlatformCaseFact[] = [];
  const sport = str(data.sport);
  const city = str(data.city);
  const teams = num(data.teamCount ?? data.clubCount);
  const athletes = num(data.athleteCount);
  const officialMatches = num(data.officialMatchCount);
  const status = str(data.status ?? data.lifecycleStatus);

  if (sport || city) facts.push({ label: 'Competition', value: [sport, city].filter(Boolean).join(' · ') });
  if (status) facts.push({ label: 'Current status', value: status });
  if (teams !== null) {
    facts.push({
      label: 'Clubs',
      value: String(teams),
      // A league claiming verified status with no clubs is the case worth catching.
      tone: teams === 0 ? 'bad' : 'neutral',
    });
  }
  if (athletes !== null) {
    // A league with clubs but no athletes is not ready to be presented as verified, and it is
    // the shape a half-finished import leaves behind.
    facts.push({ label: 'Athletes', value: String(athletes), tone: athletes === 0 ? 'warn' : 'neutral' });
  }
  if (officialMatches !== null) {
    facts.push({
      label: 'Official results',
      value: String(officialMatches),
      tone: officialMatches === 0 ? 'warn' : 'good',
    });
  }

  if (!facts.length) return undefined;

  const headline = teams === 0
    ? 'This league has no clubs registered.'
    : athletes === 0
      ? 'This league has clubs but no registered athletes, so there is no roster to verify.'
      : officialMatches !== null && officialMatches === 0
        ? 'This league has published no official results yet, so there is no record to verify against.'
        : 'Verification raises how this league is presented publicly.';

  return { headline, facts };
}
