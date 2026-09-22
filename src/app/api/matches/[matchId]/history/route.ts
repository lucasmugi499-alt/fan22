import { adminDb } from '@/lib/firebase/admin';
import { hasCapabilityOrPlatformGrant } from '@/server/access/capabilities';
import { requireActivePrincipal, requireAuthenticatedUser } from '@/server/api/security';
import type { Match } from '@/types';

export const runtime = 'nodejs';

/**
 * What has happened to a fixture, for the people who run it.
 *
 * Scoped to the governing league and read-only. This exists so the match page can show a
 * readable timeline instead of pushing a League Admin into the raw audit trail for an ordinary
 * question like "why did this move".
 */
export async function GET(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;
  const inactive = await requireActivePrincipal(auth.actor);
  if (inactive) return inactive;

  const matchSnapshot = await adminDb.collection('matches').doc(matchId).get();
  if (!matchSnapshot.exists) return Response.json({ error: 'Match not found.' }, { status: 404 });
  const match = { id: matchSnapshot.id, ...matchSnapshot.data() } as Match;

  const permitted = await hasCapabilityOrPlatformGrant(
    auth.actor.uid,
    { scopeType: 'league', scopeId: match.leagueId },
    'league.fixture.manage',
  );
  if (!permitted) {
    return Response.json({ error: 'You do not administer this league.' }, { status: 403 });
  }

  /*
   * The assignment travels with the history because the match page needs both and neither is
   * client-readable. Without it the page could show a fixture it had just assigned somebody to
   * and still say nobody was assigned.
   */
  const assignmentSnapshot = await adminDb.collection('fieldManagerAssignments')
    .where('matchId', '==', matchId)
    .limit(1)
    .get()
    .catch(() => null);
  const assignmentDoc = assignmentSnapshot?.docs[0];
  const assignmentData = assignmentDoc?.data();
  const fieldManager = assignmentData?.fieldManagerId
    ? await adminDb.collection('fieldManagers').doc(String(assignmentData.fieldManagerId)).get().catch(() => null)
    : null;
  const assignment = assignmentData
    ? {
      id: assignmentDoc!.id,
      status: String(assignmentData.status ?? 'assigned'),
      displayName: fieldManager?.exists ? String(fieldManager.data()?.displayName ?? '') : null,
      accessStartsAt: assignmentData.accessStartsAt ?? null,
      accessExpiresAt: assignmentData.accessExpiresAt ?? null,
      // The last observed sync, never an assumed one.
      lastSyncAt: assignmentData.lastSyncAt ?? assignmentData.lastHeartbeatAt ?? null,
    }
    : null;

  const [snapshot, reportSnapshot, matchReportSnapshot] = await Promise.all([
    adminDb.collection('matchScheduleChanges')
      .where('matchId', '==', matchId)
      .limit(50)
      .get()
      .catch(() => null),
    /*
     * The clubs' own accounts of the match (ADR-005). Evidence the league weighs, never a
     * candidate; it travels with the history because the match page is where the league
     * decides, and a decision made without seeing what the clubs said is the failure ADR-005
     * was written to end.
     */
    adminDb.collection('teamMatchReports')
      .where('matchId', '==', matchId)
      .limit(4)
      .get()
      .catch(() => null),
    // The submitted-not-yet-official report, if one exists (see `matchOperationalRow`).
    adminDb.collection('matchReports').doc(matchId).get().catch(() => null),
  ]);

  const matchReport = matchReportSnapshot?.exists ? matchReportSnapshot.data() ?? null : null;
  // `official` is the finalizer's terminal status; anything else is still in flight.
  const pendingReport = matchReport && matchReport.status !== 'official'
    ? {
      status: String(matchReport.status ?? 'submitted'),
      source: String(matchReport.source ?? ''),
      declaredHomeScore: typeof matchReport.declaredHomeScore === 'number' ? matchReport.declaredHomeScore : null,
      declaredAwayScore: typeof matchReport.declaredAwayScore === 'number' ? matchReport.declaredAwayScore : null,
      attestedAt: matchReport.attestedAt ?? null,
    }
    : null;

  const clubAccounts = (reportSnapshot?.docs ?? []).map((doc) => {
    const data = doc.data();
    const declared = data.declaredScore as { home?: number; away?: number } | null | undefined;
    return {
      id: doc.id,
      teamId: String(data.teamId ?? ''),
      declaredScore: declared && typeof declared.home === 'number' && typeof declared.away === 'number'
        ? { home: declared.home, away: declared.away }
        : null,
      notes: String(data.notes ?? ''),
      evidenceCount: Array.isArray(data.evidenceRefs) ? data.evidenceRefs.length : 0,
      revisions: Number(data.revisions ?? 1),
      firstReportedAt: data.firstReportedAt ?? null,
      reportedAt: data.reportedAt ?? null,
      officialResultVersionAtReport: data.officialResultVersionAtReport ?? null,
    };
  });

  const changes = (snapshot?.docs ?? [])
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((left, right) =>
      Date.parse(String((right as { createdAt?: string }).createdAt ?? '')) -
      Date.parse(String((left as { createdAt?: string }).createdAt ?? '')));

  return Response.json({ matchId, assignment, changes, clubAccounts, pendingReport }, { headers: { 'cache-control': 'private, no-store' } });
}
