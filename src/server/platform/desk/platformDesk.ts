import 'server-only';

import { consequenceFrom, orderPlatformCases, type PlatformCase } from '@/lib/platform/platformCases';

export type DeskSourceRow = { id: string; data: FirebaseFirestore.DocumentData };

export type PlatformDeskSources = {
  applications: DeskSourceRow[];
  athletes: DeskSourceRow[];
  operationalExceptions: DeskSourceRow[];
  reconciliationExceptions: DeskSourceRow[];
  trustReports: DeskSourceRow[];
  payees: DeskSourceRow[];
  settlements: DeskSourceRow[];
  failedJobs: DeskSourceRow[];
};

function iso(value: unknown, fallback: string) {
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return fallback;
}

function string(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function assigned(data: FirebaseFirestore.DocumentData) {
  const value = data.assignedToUserId ?? data.ownerUserId ?? data.reviewerUserId;
  return typeof value === 'string' ? value : null;
}

function storedDeadline(data: FirebaseFirestore.DocumentData) {
  const value = data.escalationDeadlineAt ?? data.deadlineAt ?? data.dueAt;
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function sevenDayDeadline(createdAt: string) {
  return new Date(Date.parse(createdAt) + 7 * 24 * 60 * 60_000).toISOString();
}

const OPEN_APPLICATION = new Set(['submitted', 'pending', 'under_review', 'requested_information', 'needs_information']);
const OPEN_OPERATION = new Set(['open', 'acknowledged', 'escalated', 'pending']);
const OPEN_TRUST = new Set(['open', 'investigating', 'escalated', 'pending']);
const CLOSED = new Set(['resolved', 'closed', 'superseded', 'approved', 'rejected', 'verified', 'dismissed', 'released', 'completed', 'revoked', 'suspended']);

function actionsFor(status: string, actions: PlatformCase['actions']) {
  return CLOSED.has(status) ? [] : actions;
}

/**
 * Deep normalization module: all source-specific vocabulary ends here. The Desk consumes one
 * discriminated case language and never needs to know which Firestore collection supplied it.
 */
export function assemblePlatformCases(
  sources: PlatformDeskSources,
  now = new Date(),
  options: { includeClosed?: boolean } = {},
): PlatformCase[] {
  const fallback = now.toISOString();
  const cases: PlatformCase[] = [];
  const includeClosed = options.includeClosed === true;

  for (const row of sources.applications) {
    const status = string(row.data.status ?? row.data.applicationStatus, 'pending').toLowerCase();
    if (!includeClosed && !OPEN_APPLICATION.has(status)) continue;
    const createdAt = iso(row.data.submittedAt ?? row.data.createdAt, fallback);
    cases.push({
      id: `application:${row.id}`,
      kind: 'application',
      title: string(row.data.leagueName ?? row.data.organizationName, 'League application'),
      summary: string(row.data.reviewSummary ?? row.data.notes, 'Applicant is waiting for an onboarding decision.'),
      status,
      consequence: consequenceFrom(row.data.riskLevel, row.data.duplicateRisk ? 'high' : 'normal'),
      createdAt,
      deadlineAt: storedDeadline(row.data),
      waitingOn: status.includes('information') ? 'Applicant' : 'Platform reviewer',
      href: `/admin/network/applications/${encodeURIComponent(row.id)}`,
      assignedToUserId: assigned(row.data),
      actions: actionsFor(status, [
        { commandId: 'application.approve_and_invite', label: 'Approve and invite' },
        { commandId: 'application.review', label: 'Request information' },
        { commandId: 'application.review', label: 'Reject' },
      ]),
      sourceCollection: 'leagueAdminApplications',
      sourceId: row.id,
    });
  }

  for (const row of sources.athletes) {
    const status = string(row.data.verificationStatus, 'pending').toLowerCase();
    if (!includeClosed && status !== 'pending' && status !== 'disputed') continue;
    cases.push({
      id: `athlete:${row.id}`,
      kind: 'athlete_verification',
      title: string(row.data.legalName ?? row.data.name, 'Athlete verification'),
      summary: 'A managed athlete record needs verification evidence reviewed.',
      status,
      consequence: status === 'disputed' ? 'high' : 'normal',
      createdAt: iso(row.data.createdAt, fallback),
      deadlineAt: storedDeadline(row.data),
      waitingOn: 'Platform reviewer',
      href: `/admin/network/athletes/${encodeURIComponent(row.id)}?tab=record`,
      assignedToUserId: assigned(row.data),
      actions: actionsFor(status, [
        { commandId: 'application.review', label: 'Verify evidence' },
        { commandId: 'application.review', label: 'Request information' },
      ]),
      sourceCollection: 'athletes',
      sourceId: row.id,
      leagueId: typeof row.data.leagueId === 'string' ? row.data.leagueId : undefined,
    });
  }

  for (const row of sources.operationalExceptions) {
    const status = string(row.data.status, 'open').toLowerCase();
    if (!includeClosed && !OPEN_OPERATION.has(status)) continue;
    const createdAt = iso(row.data.createdAt, fallback);
    const code = string(row.data.code, 'operational_exception').replaceAll('_', ' ');
    cases.push({
      id: `operation:${row.id}`,
      kind: 'operational_exception',
      title: `${code[0].toUpperCase()}${code.slice(1)}`,
      summary: string(row.data.summary ?? row.data.message, 'A match operation needs an attributed resolution.'),
      status,
      consequence: row.data.blocking ? 'critical' : consequenceFrom(row.data.severity, 'high'),
      createdAt,
      deadlineAt: storedDeadline(row.data) ?? sevenDayDeadline(createdAt),
      waitingOn: 'Unconflicted operator',
      href: `/admin/integrity/matches/${encodeURIComponent(string(row.data.matchId, row.id))}?tab=exceptions`,
      assignedToUserId: assigned(row.data),
      actions: actionsFor(status, [
        { commandId: 'integrity.exception.ratify', label: 'Ratify proposal' },
        { commandId: 'integrity.case.transition', label: 'Escalate' },
      ]),
      sourceCollection: 'matchOperationalExceptions',
      sourceId: row.id,
      leagueId: typeof row.data.leagueId === 'string' ? row.data.leagueId : undefined,
      matchId: typeof row.data.matchId === 'string' ? row.data.matchId : undefined,
    });
  }

  for (const row of sources.reconciliationExceptions) {
    const status = string(row.data.status, 'open').toLowerCase();
    if (!includeClosed && !OPEN_OPERATION.has(status)) continue;
    cases.push({
      id: `reconciliation:${row.id}`,
      kind: 'reconciliation_exception',
      title: `Result reconciliation · ${string(row.data.matchId, row.id)}`,
      summary: 'Recorded events and the submitted score disagree; official data remains unpublished.',
      status,
      consequence: row.data.blocking === false ? 'high' : 'critical',
      createdAt: iso(row.data.createdAt, fallback),
      deadlineAt: storedDeadline(row.data),
      waitingOn: 'Governing league',
      href: `/admin/integrity/matches/${encodeURIComponent(string(row.data.matchId, row.id))}?tab=exceptions`,
      assignedToUserId: assigned(row.data),
      actions: actionsFor(status, [
        { commandId: 'integrity.case.transition', label: 'Acknowledge' },
        { commandId: 'integrity.case.transition', label: 'Escalate' },
        { commandId: 'integrity.case.transition', label: 'Close operational case' },
      ]),
      sourceCollection: 'reconciliationExceptions',
      sourceId: row.id,
      leagueId: typeof row.data.leagueId === 'string' ? row.data.leagueId : undefined,
      matchId: typeof row.data.matchId === 'string' ? row.data.matchId : undefined,
    });
  }

  for (const row of sources.trustReports) {
    const status = string(row.data.status, 'open').toLowerCase();
    if (!includeClosed && !OPEN_TRUST.has(status)) continue;
    cases.push({
      id: `trust:${row.id}`,
      kind: 'trust',
      title: string(row.data.summary, 'Trust report'),
      summary: string(row.data.description, 'A trust report needs an attributed decision.'),
      status,
      consequence: consequenceFrom(row.data.severity, 'normal'),
      createdAt: iso(row.data.createdAt, fallback),
      deadlineAt: storedDeadline(row.data),
      waitingOn: 'Trust reviewer',
      href: `/admin/integrity/trust/${encodeURIComponent(row.id)}`,
      assignedToUserId: assigned(row.data),
      actions: actionsFor(status, [
        { commandId: 'trust.report.resolve', label: 'Resolve' },
        { commandId: 'trust.report.resolve', label: 'Dismiss' },
      ]),
      sourceCollection: 'reports',
      sourceId: row.id,
    });
  }

  for (const row of sources.payees) {
    const status = string(row.data.status, 'not_started').toLowerCase();
    if (!includeClosed && status !== 'submitted' && status !== 'rejected') continue;
    cases.push({
      id: `payee:${row.id}`,
      kind: 'payee',
      title: `Payee verification · ${row.id}`,
      summary: status === 'submitted' ? 'Redacted payout identity is waiting for two-person verification.' : 'Rejected payout identity needs corrected evidence.',
      status,
      consequence: status === 'submitted' ? 'high' : 'normal',
      createdAt: iso(row.data.submittedAt ?? row.data.updatedAt, fallback),
      deadlineAt: storedDeadline(row.data),
      waitingOn: status === 'submitted' ? 'Independent payee verifier' : 'Athlete or guardian',
      href: `/admin/network/athletes/${encodeURIComponent(row.id)}?tab=payee`,
      assignedToUserId: assigned(row.data),
      actions: actionsFor(status, [
        { commandId: 'payee.verify', label: 'Verify' },
        { commandId: 'payee.reject', label: 'Reject' },
      ]),
      sourceCollection: 'athletePayees',
      sourceId: row.id,
    });
  }

  for (const row of sources.settlements) {
    const status = string(row.data.status, '').toLowerCase();
    if (!includeClosed && status !== 'held' && status !== 'review_required') continue;
    cases.push({
      id: `settlement:${row.id}`,
      kind: 'held_settlement',
      title: `Held settlement · ${row.id}`,
      summary: string(row.data.reason, 'A settlement is held for financial review.'),
      status,
      consequence: consequenceFrom(row.data.severity, 'high'),
      createdAt: iso(row.data.createdAt ?? row.data.updatedAt, fallback),
      deadlineAt: storedDeadline(row.data),
      waitingOn: 'Finance reviewer',
      href: `/admin/money?tab=holds&case=${encodeURIComponent(row.id)}`,
      assignedToUserId: assigned(row.data),
      actions: actionsFor(status, [{ commandId: 'payee.verify', label: 'Open financial evidence', disabledReason: 'Settlement release stays disabled until PSP and reconciliation authority are approved.' }]),
      sourceCollection: 'settlements',
      sourceId: row.id,
    });
  }

  for (const row of sources.failedJobs) {
    const status = string(row.data.status, '').toLowerCase();
    if (!includeClosed && status !== 'failed') continue;
    cases.push({
      id: `job:${row.id}`,
      kind: 'failed_job',
      title: `Failed finalization · ${string(row.data.matchId, row.id)}`,
      summary: string(row.data.error, 'An idempotent finalization job failed and needs investigation.'),
      status,
      consequence: 'critical',
      createdAt: iso(row.data.createdAt ?? row.data.updatedAt, fallback),
      deadlineAt: storedDeadline(row.data),
      waitingOn: 'Platform reliability',
      href: `/admin/integrity/matches/${encodeURIComponent(string(row.data.matchId, row.id))}?tab=provenance`,
      assignedToUserId: assigned(row.data),
      actions: actionsFor(status, [{ commandId: 'integrity.case.transition', label: 'Open retry runbook', disabledReason: 'Finalization retry remains a governed idempotent server workflow, not a browser write.' }]),
      sourceCollection: 'finalizations',
      sourceId: row.id,
      matchId: typeof row.data.matchId === 'string' ? row.data.matchId : undefined,
    });
  }

  return orderPlatformCases(cases);
}
