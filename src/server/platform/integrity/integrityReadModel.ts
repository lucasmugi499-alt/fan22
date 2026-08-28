export type IntegritySourceRow = { id: string; data: Record<string, unknown> };

function text(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function iso(value: unknown): string | null {
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate().toISOString();
  return null;
}

function latest(values: unknown[]) {
  return values.map(iso).filter((value): value is string => Boolean(value)).sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

const CONDITION_COPY: Record<string, string> = {
  unsynced_events_at_submit: 'Unsynced events were measured when the report was submitted.',
  late_events_from_revoked_session: 'Late events from a revoked session were recorded.',
  event_sequence_gap: 'A stored event sequence gap needs review.',
  clock_anomaly: 'A stored clock anomaly needs review.',
  takeover_occurred: 'Capture moved to another attributed session generation.',
};

export function buildLiveIntegrityCards(input: {
  matches: IntegritySourceRow[];
  clocks: IntegritySourceRow[];
  assignments: IntegritySourceRow[];
  sessions: IntegritySourceRow[];
  reports: IntegritySourceRow[];
  exceptions: IntegritySourceRow[];
}) {
  return input.matches.map((match) => {
    const clocks = input.clocks.filter((row) => row.data.matchId === match.id || row.id === match.id);
    const assignments = input.assignments.filter((row) => row.data.matchId === match.id);
    const sessions = input.sessions.filter((row) => row.data.matchId === match.id);
    const reports = input.reports.filter((row) => row.data.matchId === match.id || row.id === match.id);
    const exceptions = input.exceptions.filter((row) => row.data.matchId === match.id && !['resolved', 'superseded'].includes(String(row.data.status)));
    const currentGeneration = Math.max(0, ...sessions.map((row) => Number(row.data.sessionGeneration ?? 0)), ...clocks.map((row) => Number(row.data.sessionGeneration ?? 0)));
    const session = sessions.find((row) => Number(row.data.sessionGeneration ?? 0) === currentGeneration) ?? sessions[0];
    const assignment = assignments.find((row) => row.id === session?.data.assignmentId) ?? assignments[0];
    const clock = clocks.sort((left, right) => Date.parse(iso(right.data.updatedAt) ?? '') - Date.parse(iso(left.data.updatedAt) ?? ''))[0];
    const report = reports.sort((left, right) => Date.parse(iso(right.data.updatedAt) ?? '') - Date.parse(iso(left.data.updatedAt) ?? ''))[0];
    const measuredConditions = exceptions
      .map((row) => CONDITION_COPY[String(row.data.code)] ?? null)
      .filter((value): value is string => Boolean(value));
    if (report?.data.status === 'requires_re_attestation') measuredConditions.push('The stored report requires re-attestation after its event set changed.');
    return {
      id: match.id,
      label: text(match.data.label, `${text(match.data.homeTeamName ?? match.data.homeTeamId, 'Home')} vs ${text(match.data.awayTeamName ?? match.data.awayTeamId, 'Away')}`),
      leagueId: text(match.data.leagueId, 'unknown league'),
      scheduledAt: iso(match.data.scheduledAt ?? match.data.date),
      matchStatus: text(match.data.status, 'unknown'),
      clockState: text(clock?.data.state, 'not recorded'),
      period: text(clock?.data.period, 'not recorded'),
      currentGeneration,
      operatorLabel: text(assignment?.data.fieldManagerName ?? assignment?.data.fieldManagerId ?? assignment?.data.userId, 'No attributed operator recorded'),
      assignmentStatus: text(assignment?.data.status, 'not assigned'),
      reportStatus: text(report?.data.status, 'no report'),
      lastObservedAt: latest([clock?.data.updatedAt, report?.data.updatedAt, session?.data.issuedAt, match.data.updatedAt]),
      freshnessSource: clock?.data.updatedAt ? 'clock.updatedAt' : report?.data.updatedAt ? 'report.updatedAt' : session?.data.issuedAt ? 'session.issuedAt' : 'match.updatedAt',
      measuredConditions: [...new Set(measuredConditions)],
      exceptions: exceptions.map((row) => ({
        id: row.id,
        code: text(row.data.code, 'operational_exception'),
        status: text(row.data.status, 'open'),
        blocking: row.data.blocking === true,
      })),
    };
  });
}

export function buildQualityDistribution(finalizations: IntegritySourceRow[]) {
  const counts = { gold: 0, silver: 0, bronze: 0, legacy: 0, ungraded: 0, total: finalizations.length };
  for (const row of finalizations) {
    const dataQuality = row.data.dataQuality && typeof row.data.dataQuality === 'object'
      ? row.data.dataQuality as Record<string, unknown> : {};
    const tier = dataQuality.tier;
    if (tier === 'gold' || tier === 'silver' || tier === 'bronze' || tier === 'legacy') counts[tier] += 1;
    else counts.ungraded += 1;
  }
  return counts;
}

export function buildEscalationRows(exceptions: IntegritySourceRow[], now = new Date()) {
  return exceptions.map((row) => {
    const createdAt = iso(row.data.createdAt) ?? now.toISOString();
    const stored = iso(row.data.escalationDeadline ?? row.data.escalationDeadlineAt ?? row.data.deadlineAt);
    const deadlineAt = stored ?? new Date(Date.parse(createdAt) + 7 * 24 * 60 * 60_000).toISOString();
    return {
      id: row.id,
      matchId: text(row.data.matchId, row.id),
      leagueId: text(row.data.leagueId, 'unknown league'),
      code: text(row.data.code, 'operational_exception'),
      status: text(row.data.status, 'open'),
      blocking: row.data.blocking === true,
      hasProposal: typeof row.data.proposedResolution === 'string' && Boolean(row.data.proposedResolution.trim()),
      createdAt,
      deadlineAt,
      deadlineSource: stored ? 'stored' as const : 'seven_day_liveness' as const,
      overdue: Date.parse(deadlineAt) <= now.valueOf(),
    };
  }).sort((left, right) => Number(right.overdue) - Number(left.overdue) || Date.parse(left.deadlineAt) - Date.parse(right.deadlineAt) || left.id.localeCompare(right.id));
}
