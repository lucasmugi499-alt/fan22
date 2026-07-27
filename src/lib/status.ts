import { ChallengeStatus, Match, MatchStatus, VerificationStatus } from '@/types';

/**
 * One canonical representation for every status vocabulary, plus the predicates that
 * decide what counts as official.
 *
 * Records arrive from Firestore and the seed data with inconsistent casing, and some
 * legacy match records conflate lifecycle with verification (`status: 'verified'`).
 * Everything crossing the data boundary goes through the `normalize*` helpers so the rest
 * of the app only ever sees canonical lowercase values. Never compare a status against a
 * display label — use these helpers and `*Label` for rendering.
 */

const VERIFICATION_STATUSES: VerificationStatus[] = ['pending', 'verified', 'rejected', 'disputed'];
const MATCH_STATUSES: MatchStatus[] = ['scheduled', 'live', 'completed', 'cancelled'];
const CHALLENGE_STATUSES: ChallengeStatus[] = [
  'draft',
  'proposed',
  'team_approved',
  'league_approved',
  'funding_open',
  'funding_locked',
  'in_progress',
  'evidence_submitted',
  'under_review',
  'achieved',
  'not_achieved',
  'void',
  'allocation_pending',
  'settled',
];

function canonical(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function normalizeVerificationStatus(value: unknown): VerificationStatus {
  const key = canonical(value);
  const match = VERIFICATION_STATUSES.find((status) => status === key);
  if (match) return match;
  // Display-layer synonyms that reached storage.
  if (key === 'pending verification' || key.startsWith('pending')) return 'pending';
  return 'pending';
}

export function normalizeMatchStatus(value: unknown): MatchStatus {
  const key = canonical(value);
  const match = MATCH_STATUSES.find((status) => status === key);
  if (match) return match;
  // Legacy records used the match status field to carry a verification outcome. Both
  // 'verified' and 'disputed' imply the match was played; the verification meaning is
  // preserved separately by `normalizeMatchVerification`.
  if (key === 'verified' || key === 'disputed' || key === 'completed') return 'completed';
  if (key === 'upcoming') return 'scheduled';
  return 'scheduled';
}

/**
 * Recovers the verification outcome for legacy match records whose lifecycle field was
 * overloaded, so collapsing `MatchStatus` does not silently discard a 'disputed' signal.
 */
export function normalizeMatchVerification(
  verificationStatus: unknown,
  legacyStatus?: unknown
): VerificationStatus {
  const legacy = canonical(legacyStatus);
  if (legacy === 'disputed') return 'disputed';
  if (legacy === 'verified' && verificationStatus == null) return 'verified';
  return normalizeVerificationStatus(verificationStatus);
}

export function normalizeChallengeStatus(value: unknown): ChallengeStatus {
  const key = canonical(value);
  const match = CHALLENGE_STATUSES.find((status) => status === key);
  if (match) return match;
  if (key === 'active' || key === 'open') return 'in_progress';
  if (key === 'locked') return 'funding_locked';
  if (key === 'failed') return 'not_achieved';
  if (key === 'paid') return 'settled';
  if (key === 'refunded') return 'void';
  if (key === 'disputed') return 'under_review';
  return 'proposed';
}

/**
 * The single definition of a result that may affect anything public: standings, team
 * records, leaderboards, athlete statistics, and sponsor reporting all gate on this.
 *
 * A match counts only when it was actually played AND its result has been verified.
 * Pending, disputed, rejected and cancelled results must never move a table — that
 * distinction is the platform's core trust claim.
 */
export function isOfficialMatch(match: Pick<Match, 'status' | 'verificationStatus'>): boolean {
  return match.status === 'completed' && match.verificationStatus === 'verified';
}

/** True once a match has been played, regardless of whether the result is trusted yet. */
export function isPlayedMatch(match: Pick<Match, 'status'>): boolean {
  return match.status === 'completed';
}

export function isUpcomingMatch(match: Pick<Match, 'status'>): boolean {
  return match.status === 'scheduled' || match.status === 'live';
}

const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  pending: 'Pending',
  verified: 'Verified',
  rejected: 'Rejected',
  disputed: 'Disputed',
};

const MATCH_LABELS: Record<MatchStatus, string> = {
  scheduled: 'Upcoming',
  live: 'Live',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const CHALLENGE_LABELS: Record<ChallengeStatus, string> = {
  draft: 'Draft',
  proposed: 'Proposed',
  team_approved: 'Team approved',
  league_approved: 'League approved',
  funding_open: 'Funding open',
  funding_locked: 'Funding locked',
  in_progress: 'In progress',
  evidence_submitted: 'Evidence submitted',
  under_review: 'Under review',
  achieved: 'Achieved',
  not_achieved: 'Not achieved',
  void: 'Void',
  allocation_pending: 'Allocation pending',
  settled: 'Settled',
};

export function isActiveChallenge(status: ChallengeStatus): boolean {
  return [
    'funding_open',
    'funding_locked',
    'in_progress',
    'evidence_submitted',
    'under_review',
  ].includes(status);
}

export function verificationLabel(status: VerificationStatus): string {
  return VERIFICATION_LABELS[status];
}

export function matchLabel(status: MatchStatus): string {
  return MATCH_LABELS[status];
}

export function challengeLabel(status: ChallengeStatus): string {
  return CHALLENGE_LABELS[status];
}
