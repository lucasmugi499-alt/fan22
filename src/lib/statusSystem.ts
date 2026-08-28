import {
  Archive,
  Circle,
  Clock,
  NotePencil,
  Scales,
  SealCheck,
  ShieldCheck,
  Timer,
  Warning,
  XCircle,
} from '@phosphor-icons/react/dist/ssr';
import type { IconComponent } from '@/lib/icons';
import type { Match, ResultSubmissionStatus, VerificationStatus } from '@/types';

/**
 * The single source of truth for how a record's trust state is presented.
 *
 * Verification is the product's core claim, so its visual language cannot be improvised per
 * page. Every state carries a label, an icon and an explanation as well as a colour —
 * status is never communicated by hue alone, which is both an accessibility requirement and
 * the difference between a badge that decorates and a badge that informs.
 */

export type UiStateId =
  | 'draft'
  | 'pending'
  | 'awaiting_confirmation'
  | 'overdue'
  | 'verified'
  | 'official'
  | 'disputed'
  | 'evidence_requested'
  | 'rejected'
  | 'superseded'
  | 'archived'
  | 'live';

export type StateTone =
  | 'verified'
  | 'pending'
  | 'warning'
  | 'disputed'
  | 'error'
  | 'info'
  | 'live'
  | 'neutral';

export interface StateDescriptor {
  id: UiStateId;
  /** Short label for badges. Sentence case — long uppercase strings are hard to scan. */
  label: string;
  tone: StateTone;
  icon: IconComponent;
  /** Plain-language answer to "what does this mean?", shown in tooltips and drawers. */
  explanation: string;
  /** Who moves this record forward. Answers "so what do I do?" */
  owner: string;
}

export const STATE: Record<UiStateId, StateDescriptor> = {
  draft: {
    id: 'draft',
    label: 'Draft',
    tone: 'neutral',
    icon: NotePencil,
    explanation: 'Created but not yet submitted. Nothing is visible publicly.',
    owner: 'Whoever created it',
  },
  pending: {
    id: 'pending',
    label: 'Pending',
    tone: 'pending',
    icon: Clock,
    explanation: 'Recorded but not yet verified. It does not count towards standings or official statistics.',
    owner: 'Awaiting review',
  },
  awaiting_confirmation: {
    id: 'awaiting_confirmation',
    label: 'Awaiting opponent',
    tone: 'pending',
    icon: Timer,
    explanation: 'One team has submitted this result. The opposing team has 72 hours to confirm or dispute it.',
    owner: 'Opposing team admin',
  },
  overdue: {
    id: 'overdue',
    label: 'Confirmation overdue',
    tone: 'warning',
    icon: Warning,
    explanation:
      'The 72-hour confirmation window passed with no response. Silence is not agreement. The league decides what happens next.',
    owner: 'League admin',
  },
  verified: {
    id: 'verified',
    label: 'Verified',
    tone: 'verified',
    icon: SealCheck,
    explanation: 'Checked against evidence and confirmed. This record can be trusted.',
    owner: 'Verified by GoalPlace256',
  },
  official: {
    id: 'official',
    label: 'Official',
    tone: 'verified',
    icon: ShieldCheck,
    explanation:
      'Finalised into the official record. It counts towards standings and official statistics.',
    owner: 'Verified by GoalPlace256',
  },
  disputed: {
    id: 'disputed',
    label: 'Disputed',
    tone: 'disputed',
    icon: Warning,
    explanation: 'The two teams disagree. The league is reviewing it, and it counts towards nothing until resolved.',
    owner: 'League admin',
  },
  evidence_requested: {
    id: 'evidence_requested',
    label: 'Evidence requested',
    tone: 'warning',
    icon: Scales,
    explanation: 'The league has asked for supporting evidence before deciding.',
    owner: 'Submitting team admin',
  },
  rejected: {
    id: 'rejected',
    label: 'Rejected',
    tone: 'error',
    icon: XCircle,
    explanation: 'Not accepted into the official record. A new submission can replace it.',
    owner: 'League admin',
  },
  superseded: {
    id: 'superseded',
    label: 'Superseded',
    tone: 'neutral',
    icon: Archive,
    explanation: 'Replaced by a corrected version. Kept for the audit trail rather than deleted.',
    owner: 'Historical record',
  },
  archived: {
    id: 'archived',
    label: 'Archived',
    tone: 'neutral',
    icon: Archive,
    explanation: 'Closed and retained for reference.',
    owner: 'Historical record',
  },
  live: {
    id: 'live',
    label: 'Live',
    tone: 'live',
    icon: Circle,
    explanation: 'This match is being played right now.',
    owner: 'In progress',
  },
};

/** Tailwind-facing classes per tone. Fill, text and border always move together. */
export const TONE_CLASS: Record<StateTone, string> = {
  verified: 'text-[var(--state-verified)] bg-[var(--state-verified-bg)] border-[var(--state-verified)]/30',
  pending: 'text-[var(--state-pending)] bg-[var(--state-pending-bg)] border-[var(--state-pending)]/30',
  warning: 'text-[var(--state-warning)] bg-[var(--state-warning-bg)] border-[var(--state-warning)]/30',
  disputed: 'text-[var(--state-disputed)] bg-[var(--state-disputed-bg)] border-[var(--state-disputed)]/30',
  error: 'text-[var(--state-error)] bg-[var(--state-error-bg)] border-[var(--state-error)]/30',
  info: 'text-[var(--state-info)] bg-[var(--state-info-bg)] border-[var(--state-info)]/30',
  live: 'text-[var(--state-live)] bg-[var(--state-live-bg)] border-[var(--state-live)]/40',
  neutral: 'text-[var(--state-neutral)] bg-[var(--state-neutral-bg)] border-[var(--state-neutral)]/30',
};

const VERIFICATION_TO_UI: Record<VerificationStatus, UiStateId> = {
  pending: 'pending',
  verified: 'verified',
  rejected: 'rejected',
  disputed: 'disputed',
};

const SUBMISSION_TO_UI: Record<ResultSubmissionStatus, UiStateId> = {
  pending_confirmation: 'awaiting_confirmation',
  confirmation_overdue: 'overdue',
  confirmed: 'pending',
  disputed: 'disputed',
  official: 'official',
  rejected: 'rejected',
  withdrawn: 'archived',
  superseded: 'superseded',
};

export function stateForVerification(status: VerificationStatus): StateDescriptor {
  return STATE[VERIFICATION_TO_UI[status]];
}

export function stateForSubmission(status: ResultSubmissionStatus): StateDescriptor {
  return STATE[SUBMISSION_TO_UI[status]];
}

/**
 * The trust state a match should display.
 *
 * A live match reads as live; otherwise the verification state governs, because a played
 * match whose result is unverified must never look settled.
 */
export function stateForMatch(match: Pick<Match, 'status' | 'verificationStatus'>): StateDescriptor {
  if (match.status === 'live') return STATE.live;
  if (match.status === 'scheduled') return STATE.draft;
  if (match.status === 'cancelled') return STATE.archived;
  return match.verificationStatus === 'verified'
    ? STATE.official
    : stateForVerification(match.verificationStatus);
}
