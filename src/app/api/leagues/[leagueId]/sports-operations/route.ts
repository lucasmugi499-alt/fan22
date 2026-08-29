import { createHash, randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { hasCapabilityOrPlatformGrant } from '@/server/access/capabilities';
import { platformAuditEvent } from '@/server/platform/commands/securePlatformCommand';
import { recomputeSeasonStandings } from '@/server/standings/projection';
import { leagueOperatorUserIds, notifyAll } from '@/server/notifications/notify';
import type { AwardedResultReason } from '@/types';

export const runtime = 'nodejs';

/**
 * Results decided off the field, and points changes no match produced.
 *
 * ## What was missing
 *
 * Grassroots leagues run on these constantly — a club fails to show, fields a suspended
 * player, or is docked points for discipline. GoalPlace had no representation for any of it.
 * The words `forfeit`, `walkover` and `pointsDeduction` did not appear in the codebase.
 *
 * The result model could only describe what happened ON the field, so a league awarding a 3-0
 * walkover had nowhere to put it: the fixture sat unresolved and GoalPlace's table stayed
 * permanently one result behind the league's own. That is the fastest way to lose a pilot —
 * the operator stops trusting the product, keeps their spreadsheet, and the spreadsheet
 * becomes the real table.
 *
 * ## Why this is a server command and not a client write
 *
 * Both of these change a league table. That puts them in the same class as every other
 * decision that changes one: behind a command that re-checks capability against the projected
 * index, requires a reason, records who ruled, and writes an audit entry.
 * `firestore.rules.next` denies every client path to `matches` and `pointsAdjustments`, so
 * there is no second way in.
 *
 * An awarded result is written as a normal official result carrying an `awardedResult`
 * provenance. It counts in the table at full weight, because it IS the official result — what
 * differs is how it was decided, not how much it counts. Demoting it would be inventing a rule
 * no league asked for.
 */

const AWARDED_REASONS: [AwardedResultReason, ...AwardedResultReason[]] = [
  'forfeit',
  'walkover',
  'ruling',
  'abandoned',
];

const bodySchema = z.discriminatedUnion('action', [
  /**
   * A result the league decided rather than recorded. The score is the ruling's, not a
   * report's, which is why it is entered here rather than through any submission path.
   */
  z.object({
    action: z.literal('award_result'),
    matchId: z.string().trim().min(1).max(180),
    homeScore: z.number().int().min(0).max(200),
    awayScore: z.number().int().min(0).max(200),
    awardReason: z.enum(AWARDED_REASONS),
    // The league's own words, shown publicly beside the result. Required, because "3-0" with
    // no explanation is exactly the unexplained table entry this is meant to prevent.
    note: z.string().trim().min(4).max(600),
  }),
  z.object({
    action: z.literal('adjust_points'),
    teamId: z.string().trim().min(1).max(180),
    seasonId: z.string().trim().min(1).max(180),
    // Signed. A deduction is negative; a restoration on appeal is positive.
    delta: z.number().int().min(-100).max(100).refine((value) => value !== 0, {
      message: 'A points adjustment of zero changes nothing.',
    }),
    reason: z.string().trim().min(4).max(600),
  }),
  /**
   * Withdrawing an adjustment, which never deletes it. The ruling and its reversal are both
   * part of the season's record, exactly as a superseded official result is archived rather
   * than mutated.
   */
  z.object({
    action: z.literal('rescind_adjustment'),
    adjustmentId: z.string().trim().min(1).max(220),
  }),
]);

/** Deterministic, so a retried request updates one record rather than docking a club twice. */
function adjustmentId(seasonId: string, teamId: string, reason: string) {
  const key = createHash('sha256')
    .update(`${seasonId}:${teamId}:${reason}`)
    .digest('hex')
    .slice(0, 32);
  return `adjustment_${key}`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  const mutation = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 4_096,
    invalidBodyError: 'Invalid sports operations request.',
    accountClass: ['organization_operator', 'platform_operator'],
    rateLimit: {
      bucket: 'league_sports_operations',
      limit: 30,
      windowSeconds: 60,
      identity: () => [leagueId],
    },
  });
  if ('response' in mutation) return mutation.response;
  const { actor, data, requestId } = mutation;
  const nowIso = new Date().toISOString();

  // The same capability that governs entering a result. Awarding one is entering one, with a
  // ruling attached — it should not be reachable by anybody who could not enter a played result.
  const permitted = await hasCapabilityOrPlatformGrant(
    actor.uid,
    { scopeType: 'league', scopeId: leagueId },
    'league.result.enter',
  );
  if (!permitted) {
    return Response.json({ error: 'You do not operate this league.' }, { status: 403 });
  }

  if (data.action === 'award_result') {
    const matchRef = adminDb.collection('matches').doc(data.matchId);
    const snapshot = await matchRef.get();
    if (!snapshot.exists || snapshot.data()?.leagueId !== leagueId) {
      return Response.json({ error: 'Fixture not found in this league.' }, { status: 404 });
    }
    const match = snapshot.data() ?? {};

    // A fixture that already has an official played result is not something to award over.
    // Correcting a verified result is its own audited path, and conflating the two would let a
    // ruling silently overwrite a result somebody reported from the field.
    if (match.verificationStatus === 'verified' && !match.awardedResult) {
      return Response.json({
        error: 'This fixture already has an official result. Use the correction path instead.',
      }, { status: 409 });
    }

    const auditEventId = randomUUID();
    await matchRef.update({
      status: 'completed',
      verificationStatus: 'verified',
      teamAScore: data.homeScore,
      teamBScore: data.awayScore,
      score: { home: data.homeScore, away: data.awayScore },
      awardedResult: {
        reason: data.awardReason,
        note: data.note,
        ruledByUserId: actor.uid,
        ruledAt: nowIso,
        auditEventId,
      },
      verifiedBy: 'league_ruling',
      updatedAt: FieldValue.serverTimestamp(),
    });

    await adminDb.collection('adminAuditEvents').doc(auditEventId).set(platformAuditEvent({
      actor,
      requestId,
      action: 'verified',
      targetCollection: 'matches',
      targetId: data.matchId,
      note: `Awarded by league ruling (${data.awardReason}): ${data.note}`,
      beforeSummary: {
        status: match.status,
        verificationStatus: match.verificationStatus,
        teamAScore: match.teamAScore ?? null,
        teamBScore: match.teamBScore ?? null,
      },
      afterSummary: {
        status: 'completed',
        verificationStatus: 'verified',
        teamAScore: data.homeScore,
        teamBScore: data.awayScore,
        awardReason: data.awardReason,
      },
    }));

    const seasonId = match.seasonId as string | undefined;
    // Immediately, not on the next hourly pass. A league that awards a walkover and does not
    // see its table move will conclude the feature does not work.
    if (seasonId) await recomputeSeasonStandings(adminDb, seasonId, { leagueId });

    await notifyAll(adminDb, await leagueOperatorUserIds(adminDb, leagueId), {
      event: 'result_finalized',
      entityId: data.matchId,
      title: 'Result awarded by ruling',
      body: `${data.note} The league table has been updated.`,
      href: `/matches/${data.matchId}`,
    });

    return Response.json({ ok: true, matchId: data.matchId, auditEventId });
  }

  if (data.action === 'adjust_points') {
    const teamSnapshot = await adminDb.collection('teams').doc(data.teamId).get();
    if (!teamSnapshot.exists || teamSnapshot.data()?.leagueId !== leagueId) {
      return Response.json({ error: 'Club not found in this league.' }, { status: 404 });
    }

    const id = adjustmentId(data.seasonId, data.teamId, data.reason);
    const auditEventId = randomUUID();
    await adminDb.collection('pointsAdjustments').doc(id).set({
      id,
      leagueId,
      seasonId: data.seasonId,
      teamId: data.teamId,
      delta: data.delta,
      reason: data.reason,
      createdByUserId: actor.uid,
      createdAt: nowIso,
      auditEventId,
      // Cleared on re-issue: applying the same adjustment again after a rescission is the
      // league reinstating it, and a stale `rescindedAt` would leave it silently inert.
      rescindedAt: FieldValue.delete(),
      rescindedByUserId: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await adminDb.collection('adminAuditEvents').doc(auditEventId).set(platformAuditEvent({
      actor,
      requestId,
      action: 'updated',
      targetCollection: 'pointsAdjustments',
      targetId: id,
      note: `Points adjustment ${data.delta > 0 ? '+' : ''}${data.delta}: ${data.reason}`,
      afterSummary: { teamId: data.teamId, seasonId: data.seasonId, delta: data.delta },
    }));

    await recomputeSeasonStandings(adminDb, data.seasonId, { leagueId });
    return Response.json({ ok: true, adjustmentId: id, auditEventId });
  }

  const ref = adminDb.collection('pointsAdjustments').doc(data.adjustmentId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.leagueId !== leagueId) {
    return Response.json({ error: 'Adjustment not found in this league.' }, { status: 404 });
  }
  const auditEventId = randomUUID();
  // Rescinded, never deleted — the ruling and its reversal are both part of the record.
  await ref.update({
    rescindedAt: nowIso,
    rescindedByUserId: actor.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await adminDb.collection('adminAuditEvents').doc(auditEventId).set(platformAuditEvent({
    actor,
    requestId,
    action: 'revoked',
    targetCollection: 'pointsAdjustments',
    targetId: data.adjustmentId,
    note: 'Points adjustment rescinded.',
  }));

  const seasonId = snapshot.data()?.seasonId as string | undefined;
  if (seasonId) await recomputeSeasonStandings(adminDb, seasonId, { leagueId });

  return Response.json({ ok: true, adjustmentId: data.adjustmentId, auditEventId });
}
