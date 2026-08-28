export type PlatformCaseKind =
  | 'application'
  | 'athlete_verification'
  | 'operational_exception'
  | 'reconciliation_exception'
  | 'trust'
  | 'payee'
  | 'held_settlement'
  | 'failed_job';

export type PlatformCaseConsequence = 'critical' | 'high' | 'normal' | 'low';

export type PlatformCaseActionField =
  | { name: string; label: string; kind: 'text'; placeholder?: string; required?: boolean; maxLength?: number; defaultValue?: string }
  | { name: string; label: string; kind: 'textarea'; placeholder?: string; required?: boolean; maxLength?: number; defaultValue?: string }
  | { name: string; label: string; kind: 'select'; options: { value: string; label: string }[]; required?: boolean; defaultValue?: string };

export type PlatformCaseAction = {
  commandId: string;
  label: string;
  disabledReason?: string;
  /**
   * Command inputs already bound to this case, so the Desk can run the decision where the
   * operator is reading it.
   *
   * Without this a Desk action could only navigate to the entity page and re-open the
   * command there, which is the detail-page round trip the Desk exists to remove. The sheet
   * still collects the reason and any confirmation, and the endpoint still runs every check.
   */
  inputs?: Record<string, string | number | boolean>;
  /** Path segments for registry endpoints that address a record in their URL. */
  pathParams?: Record<string, string>;
  /** Extra operator input this command needs before it can run from the Desk. */
  fields?: PlatformCaseActionField[];
  /** Message shown in place after the command succeeds. */
  successMessage?: string;
};

export type PlatformCase = {
  id: string;
  kind: PlatformCaseKind;
  title: string;
  summary: string;
  status: string;
  consequence: PlatformCaseConsequence;
  createdAt: string;
  deadlineAt: string | null;
  waitingOn: string;
  href: string;
  assignedToUserId: string | null;
  actions: PlatformCaseAction[];
  sourceCollection: string;
  sourceId: string;
  leagueId?: string;
  matchId?: string;
};

const CONSEQUENCE_ORDER: Record<PlatformCaseConsequence, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function timeOrMax(value: string | null) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function createdTime(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

/** Consequence first, then the earliest stored escalation deadline, then the oldest case. */
export function orderPlatformCases(cases: readonly PlatformCase[]) {
  return [...cases].sort((left, right) =>
    CONSEQUENCE_ORDER[left.consequence] - CONSEQUENCE_ORDER[right.consequence]
    || timeOrMax(left.deadlineAt) - timeOrMax(right.deadlineAt)
    || createdTime(left.createdAt) - createdTime(right.createdAt)
    || left.id.localeCompare(right.id),
  );
}

export function platformCaseMatchesFilter(
  item: PlatformCase,
  filter: string,
  actorUserId: string,
) {
  if (filter === 'all') return true;
  if (filter === 'mine') return item.assignedToUserId === actorUserId;
  if (filter === 'history') return ['resolved', 'closed', 'superseded', 'approved', 'rejected', 'verified', 'dismissed', 'released', 'completed', 'revoked', 'suspended'].includes(item.status);
  if (filter === 'integrity') return item.kind === 'operational_exception' || item.kind === 'reconciliation_exception' || item.kind === 'failed_job';
  if (filter === 'money') return item.kind === 'payee' || item.kind === 'held_settlement';
  if (filter === 'applications') return item.kind === 'application' || item.kind === 'athlete_verification';
  return item.kind === filter;
}

export function consequenceFrom(value: unknown, fallback: PlatformCaseConsequence = 'normal'): PlatformCaseConsequence {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'critical' || normalized === 'severe') return 'critical';
  if (normalized === 'high' || normalized === 'escalated' || normalized === 'blocking') return 'high';
  if (normalized === 'low' || normalized === 'info') return 'low';
  return fallback;
}
