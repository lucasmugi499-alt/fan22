import { getPlatformWorkbench, type PlatformWorkbenchKind } from '@/lib/platform/workbenches';

export type WorkbenchSourceRow = {
  id: string;
  data: Record<string, unknown>;
};

export type WorkbenchRecord = {
  id: string;
  title: string;
  meta: string;
  status: string;
  href?: string;
  details: Array<{ label: string; value: string }>;
};

export type PlatformWorkbenchView = {
  kind: PlatformWorkbenchKind;
  tab: string;
  entity: {
    id: string;
    title: string;
    subtitle: string;
    status: string;
  };
  metrics: Array<{ label: string; value: string | number; tone?: 'good' | 'warn' | 'bad' }>;
  records: WorkbenchRecord[];
  emptyMessage: string;
};

type BuildInput = {
  kind: PlatformWorkbenchKind;
  entityId: string;
  tab: string;
  entity: WorkbenchSourceRow;
  related: WorkbenchSourceRow[];
};

function text(value: unknown, fallback = 'Not recorded') {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return fallback;
}

function date(value: unknown) {
  if (typeof value === 'object' && value && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (typeof value !== 'string') return 'Time not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toISOString();
}

function entityTitle(kind: PlatformWorkbenchKind, id: string, data: Record<string, unknown>) {
  if (kind === 'athlete') return text(data.legalName ?? data.name, id);
  if (kind === 'person') return text(data.displayName ?? data.name ?? data.email, id);
  if (kind === 'match') return text(data.label, `${text(data.homeTeamName ?? data.homeTeamId, 'Home')} vs ${text(data.awayTeamName ?? data.awayTeamId, 'Away')}`);
  return text(data.name, id);
}

function entitySubtitle(kind: PlatformWorkbenchKind, data: Record<string, unknown>) {
  if (kind === 'league') return [data.sport, data.city].map((item) => text(item, '')).filter(Boolean).join(' · ') || 'League record';
  if (kind === 'team') return [data.sport, data.city ?? data.location].map((item) => text(item, '')).filter(Boolean).join(' · ') || 'Team record';
  if (kind === 'athlete') return [data.registeredPosition ?? data.position, data.ageGroup].map((item) => text(item, '')).filter(Boolean).join(' · ') || 'Athlete record';
  if (kind === 'person') return text(data.email, 'Account record');
  return `${text(data.venue, 'Venue pending')} · ${date(data.scheduledAt ?? data.date)}`;
}

function entityStatus(data: Record<string, unknown>) {
  return text(data.lifecycleStatus ?? data.verificationStatus ?? data.accountStatus ?? data.status, 'unknown');
}

function historyRecord(row: WorkbenchSourceRow): WorkbenchRecord {
  return {
    id: row.id,
    title: text(row.data.action, 'Recorded change').replaceAll('_', ' '),
    meta: `${text(row.data.targetCollection, 'record')}/${text(row.data.targetId, row.id)}`,
    status: 'immutable',
    details: [
      { label: 'Actor', value: text(row.data.actorUserId ?? row.data.actorId, 'System') },
      { label: 'Recorded', value: date(row.data.createdAt) },
      ...(row.data.note ? [{ label: 'Reason', value: text(row.data.note) }] : []),
    ],
  };
}

function payeeRecord(row: WorkbenchSourceRow): WorkbenchRecord {
  const status = text(row.data.status, 'not submitted');
  return {
    id: row.id,
    title: 'Payout identity readiness',
    meta: 'Private destination details are intentionally redacted.',
    status,
    details: [
      { label: 'Verification', value: status },
      { label: 'Evidence count', value: Array.isArray(row.data.evidenceRefs) ? String(row.data.evidenceRefs.length) : '0' },
      { label: 'Updated', value: date(row.data.updatedAt ?? row.data.createdAt) },
    ],
  };
}

function matchOperationRecord(row: WorkbenchSourceRow): WorkbenchRecord {
  const generation = text(row.data.sessionGeneration, '1');
  const revoked = Boolean(row.data.revokedAt);
  const clockState = typeof row.data.state === 'string';
  return {
    id: row.id,
    title: clockState ? 'Match clock anchor' : `Capture session generation ${generation}`,
    meta: clockState ? 'Derived from stored clock anchors; no online presence is inferred.' : text(row.data.assignmentId, 'Assignment pending'),
    status: clockState ? text(row.data.state, 'unknown') : revoked ? 'revoked' : 'issued',
    details: clockState ? [
      { label: 'State', value: text(row.data.state) },
      { label: 'Period', value: text(row.data.period) },
      { label: 'Generation', value: generation },
      { label: 'Updated', value: date(row.data.updatedAt) },
    ] : [
      { label: 'Assignment', value: text(row.data.assignmentId) },
      { label: 'Generation', value: generation },
      { label: 'Issued', value: date(row.data.issuedAt) },
      { label: 'Expires', value: date(row.data.expiresAt) },
    ],
  };
}

function standardRecord(row: WorkbenchSourceRow, tab: string): WorkbenchRecord {
  const data = row.data;
  const title = text(
    data.name ?? data.legalName ?? data.displayName ?? data.summary ?? data.code ?? data.action,
    row.id,
  );
  const status = text(data.lifecycleStatus ?? data.verificationStatus ?? data.accountStatus ?? data.status, 'recorded');
  const href = typeof data.adminHref === 'string' && data.adminHref.startsWith('/admin') ? data.adminHref : undefined;
  const detailCandidates: Array<[string, unknown]> = [
    ['Type', data.type ?? tab],
    ['League', data.leagueName ?? data.leagueId],
    ['Team', data.teamName ?? data.teamId],
    ['Role', data.role],
    ['Scope', data.scopeType && data.scopeId ? `${text(data.scopeType)} · ${text(data.scopeId)}` : undefined],
    ['Owner', data.assignedToUserId ?? data.assignedReviewer ?? data.userId],
    ['Deadline', data.escalationDeadline ?? data.deadlineAt],
    ['Updated', data.updatedAt ?? data.createdAt],
  ];
  return {
    id: row.id,
    title,
    meta: text(data.description ?? data.detail ?? data.email, `${tab.replaceAll('_', ' ')} record`),
    status,
    href,
    details: detailCandidates
      .filter((entry): entry is [string, Exclude<unknown, undefined | null>] => entry[1] !== undefined && entry[1] !== null)
      .slice(0, 4)
      .map(([label, value]) => ({ label, value: label === 'Updated' || label === 'Deadline' ? date(value) : text(value) })),
  };
}

function metrics(kind: PlatformWorkbenchKind, data: Record<string, unknown>, relatedCount: number) {
  if (kind === 'league') return [
    { label: 'Teams', value: Number(data.teamsCount ?? 0) },
    { label: 'Matches', value: Number(data.matchesCount ?? 0) },
    { label: 'Verified results', value: `${Number(data.verifiedResultsRate ?? 0)}%` },
    { label: 'Current view', value: relatedCount },
  ];
  if (kind === 'team') return [
    { label: 'Record', value: `${Number(data.wins ?? 0)}-${Number(data.draws ?? 0)}-${Number(data.losses ?? 0)}` },
    { label: 'Supporters', value: Number(data.supportersCount ?? 0) },
    { label: 'Verified', value: data.verified ? 'Yes' : 'No', tone: data.verified ? 'good' as const : 'warn' as const },
    { label: 'Current view', value: relatedCount },
  ];
  if (kind === 'athlete') return [
    { label: 'Verification', value: text(data.verificationStatus ?? data.status, 'pending') },
    { label: 'Team', value: text(data.teamId, 'Unassigned') },
    { label: 'League', value: text(data.leagueId, 'Unassigned') },
    { label: 'Current view', value: relatedCount },
  ];
  if (kind === 'person') return [
    { label: 'Account class', value: text(data.accountClass, 'legacy') },
    { label: 'Status', value: text(data.accountStatus ?? data.status, 'unknown') },
    { label: 'Access version', value: Number(data.accessVersion ?? 1) },
    { label: 'Current view', value: relatedCount },
  ];
  return [
    { label: 'Status', value: text(data.status, 'unknown') },
    { label: 'Verification', value: text(data.verificationStatus, 'pending') },
    { label: 'Result version', value: Number(data.officialResultVersion ?? 0) },
    { label: 'Current view', value: relatedCount },
  ];
}

/**
 * Shapes private server data into the deliberately narrow workbench projection.
 * Raw records are never returned: that makes secret-bearing session and payee fields
 * impossible to leak merely because a new field was added to Firestore.
 */
export function buildPlatformWorkbenchView(input: BuildInput): PlatformWorkbenchView {
  const definition = getPlatformWorkbench(input.kind);
  if (!definition || !definition.tabs.some((tab) => tab.id === input.tab)) {
    throw new Error('Unsupported workbench tab.');
  }
  const records = input.tab === 'history'
    ? input.related.map(historyRecord)
    : input.kind === 'athlete' && input.tab === 'payee'
      ? input.related.map(payeeRecord)
      : input.kind === 'match' && input.tab === 'operations'
        ? input.related.map(matchOperationRecord)
        : input.related.map((row) => standardRecord(row, input.tab));
  return {
    kind: input.kind,
    tab: input.tab,
    entity: {
      id: input.entityId,
      title: entityTitle(input.kind, input.entityId, input.entity.data),
      subtitle: entitySubtitle(input.kind, input.entity.data),
      status: entityStatus(input.entity.data),
    },
    metrics: metrics(input.kind, input.entity.data, records.length),
    records,
    emptyMessage: `No ${definition.tabs.find((tab) => tab.id === input.tab)?.label.toLowerCase() ?? 'records'} are recorded for this ${input.kind}.`,
  };
}
