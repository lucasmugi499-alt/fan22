import type { AppRole, Challenge, ChallengeStatus } from '@/types';

export type ChallengeAction =
  | 'team_approve'
  | 'team_reject'
  | 'league_approve'
  | 'activate_non_cash'
  | 'commit_grant'
  | 'open_funding'
  | 'lock_funding'
  | 'start_challenge'
  | 'submit_evidence'
  | 'begin_review'
  | 'mark_achieved'
  | 'mark_not_achieved'
  | 'mark_void'
  | 'prepare_allocation'
  | 'settle'
  | 'close_non_cash';

const NEXT_STATUS: Record<ChallengeAction, ChallengeStatus> = {
  team_approve: 'team_approved',
  team_reject: 'void',
  league_approve: 'league_approved',
  activate_non_cash: 'in_progress',
  commit_grant: 'funding_locked',
  open_funding: 'funding_open',
  lock_funding: 'funding_locked',
  start_challenge: 'in_progress',
  submit_evidence: 'evidence_submitted',
  begin_review: 'under_review',
  mark_achieved: 'achieved',
  mark_not_achieved: 'not_achieved',
  mark_void: 'void',
  prepare_allocation: 'allocation_pending',
  settle: 'settled',
  close_non_cash: 'settled',
};

const ALLOWED_FROM: Record<ChallengeAction, ChallengeStatus[]> = {
  team_approve: ['proposed'],
  team_reject: ['proposed'],
  league_approve: ['team_approved'],
  activate_non_cash: ['league_approved'],
  commit_grant: ['league_approved'],
  open_funding: ['league_approved'],
  lock_funding: ['funding_open'],
  start_challenge: ['funding_locked'],
  submit_evidence: ['in_progress'],
  begin_review: ['evidence_submitted'],
  mark_achieved: ['under_review'],
  mark_not_achieved: ['under_review'],
  mark_void: [
    'proposed',
    'team_approved',
    'league_approved',
    'funding_open',
    'funding_locked',
    'in_progress',
    'evidence_submitted',
    'under_review',
  ],
  prepare_allocation: ['achieved', 'not_achieved', 'void'],
  settle: ['allocation_pending'],
  close_non_cash: ['achieved', 'not_achieved', 'void'],
};

const ALLOWED_ROLES: Record<ChallengeAction, AppRole[]> = {
  team_approve: ['team_admin', 'platform_admin', 'super_admin'],
  team_reject: ['team_admin', 'platform_admin', 'super_admin'],
  league_approve: ['league_admin', 'platform_admin', 'super_admin'],
  activate_non_cash: ['league_admin', 'platform_admin', 'super_admin'],
  commit_grant: ['league_admin', 'platform_admin', 'super_admin'],
  open_funding: ['league_admin', 'platform_admin', 'super_admin'],
  lock_funding: ['league_admin', 'platform_admin', 'super_admin'],
  start_challenge: ['league_admin', 'platform_admin', 'super_admin'],
  submit_evidence: ['athlete', 'team_admin', 'platform_admin', 'super_admin'],
  begin_review: ['league_admin', 'platform_admin', 'super_admin'],
  mark_achieved: ['league_admin', 'platform_admin', 'super_admin'],
  mark_not_achieved: ['league_admin', 'platform_admin', 'super_admin'],
  mark_void: ['league_admin', 'platform_admin', 'super_admin'],
  prepare_allocation: ['platform_admin', 'super_admin'],
  settle: ['platform_admin', 'super_admin'],
  close_non_cash: ['platform_admin', 'super_admin'],
};

export function challengeNextStatus(status: ChallengeStatus, action: ChallengeAction) {
  if (!ALLOWED_FROM[action].includes(status)) {
    throw new Error(`Challenge cannot ${action.replaceAll('_', ' ')} from ${status}.`);
  }
  return NEXT_STATUS[action];
}

export function roleCanTransitionChallenge(role: AppRole, action: ChallengeAction) {
  return ALLOWED_ROLES[action].includes(role);
}

export function isChallengeCashDisabled(challenge: Pick<Challenge, 'fundingModel'>) {
  return challenge.fundingModel === 'non_cash' || challenge.fundingModel === 'sponsor_grant';
}

export function challengeActionMatchesFundingModel(
  fundingModel: Challenge['fundingModel'],
  action: ChallengeAction,
) {
  if (fundingModel === 'non_cash') {
    return !['open_funding', 'lock_funding', 'commit_grant', 'prepare_allocation', 'settle'].includes(action);
  }
  return !['activate_non_cash', 'close_non_cash', 'open_funding', 'lock_funding'].includes(action);
}

export function challengeLifecycleLabel(
  fundingModel: Challenge['fundingModel'],
  status: ChallengeStatus,
) {
  if (fundingModel === 'non_cash') {
    const labels: Partial<Record<ChallengeStatus, string>> = { league_approved: 'Approved', in_progress: 'Active', settled: 'Closed' };
    return labels[status] ?? status.replaceAll('_', ' ');
  }
  const labels: Partial<Record<ChallengeStatus, string>> = { funding_locked: 'Grant committed', allocation_pending: 'Allocation approved', settled: 'Paid' };
  return labels[status] ?? status.replaceAll('_', ' ');
}

export function challengeTermsAreLocked(status: ChallengeStatus) {
  return ![
    'draft',
    'proposed',
    'team_approved',
    'league_approved',
  ].includes(status);
}
