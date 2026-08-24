import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { hasCapability } from '@/server/access/capabilities';

export const runtime = 'nodejs';

/**
 * "Something wrong?" on a verified career record.
 *
 * This is the whole of an athlete's reach toward their sporting record, and it is a report
 * rather than an edit. An athlete who believes they scored a goal that was never recorded
 * opens a case; they do not get a field to type a goal into, and this route writes nothing
 * that any projection reads.
 *
 * The alternative, letting an athlete assert a statistic, is the defect the entire trust
 * architecture exists to prevent: the measured party would be authoring the measurement.
 */
const bodySchema = z.object({
  matchId: z.string().trim().max(180).optional(),
  seasonId: z.string().trim().max(180).optional(),
  category: z.enum(['missing_event', 'wrong_attribution', 'wrong_score', 'not_me', 'other']),
  detail: z.string().trim().min(10).max(1200),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ athleteId: string }> },
) {
  const { athleteId } = await params;
  const mutation = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 4_096,
    invalidBodyError: 'Tell us what looks wrong, in at least a sentence.',
    // Deliberately generous over a long window rather than tight: an athlete disputing their
    // record is not abuse, and a limit that bites during a genuine disagreement teaches them
    // the route does not work.
    rateLimit: { bucket: 'athlete_stat_issue', limit: 10, windowSeconds: 3_600, identity: () => [athleteId] },
  });
  if ('response' in mutation) return mutation.response;
  const { actor, data } = mutation;

  const athleteSnapshot = await adminDb.collection('athletes').doc(athleteId).get();
  if (!athleteSnapshot.exists) return Response.json({ error: 'Athlete not found.' }, { status: 404 });
  const athlete = athleteSnapshot.data() ?? {};

  /**
   * The athlete themselves, or somebody who governs the league.
   *
   * A league operator raising one on an athlete's behalf is the ordinary case in grassroots
   * sport: the athlete tells their coach, who tells the league. Requiring the athlete to hold
   * an account before their record can be questioned would make the correction route useless
   * for exactly the people least likely to have one.
   */
  const [isSelf, governsLeague] = await Promise.all([
    hasCapability(actor.uid, { scopeType: 'athlete', scopeId: athleteId }, 'athlete.persona.manage'),
    typeof athlete.leagueId === 'string' && athlete.leagueId
      ? hasCapability(actor.uid, { scopeType: 'league', scopeId: athlete.leagueId }, 'league.result.resolve')
      : Promise.resolve(false),
  ]);
  if (!isSelf && !governsLeague) {
    return Response.json({ error: 'Only this athlete or their league can raise a record issue.' }, { status: 403 });
  }

  const now = new Date().toISOString();
  /**
   * Deterministic within a match and category, so tapping "report" twice from a flaky
   * connection opens one case rather than two identical ones in the league's queue.
   */
  const issueId = `stat_issue_${createHash('sha256')
    .update(`${athleteId}:${data.matchId ?? 'career'}:${data.category}:${actor.uid}`)
    .digest('hex')
    .slice(0, 32)}`;

  await adminDb.collection('athleteStatIssues').doc(issueId).set({
    id: issueId,
    athleteId,
    ...(data.matchId ? { matchId: data.matchId } : {}),
    ...(data.seasonId ? { seasonId: data.seasonId } : {}),
    leagueId: athlete.leagueId ?? '',
    raisedByUserId: actor.uid,
    category: data.category,
    detail: data.detail,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    updatedAtServer: FieldValue.serverTimestamp(),
  }, { merge: true });

  return Response.json({
    ok: true,
    issueId,
    // Said plainly, because the honest answer is that a human decides and it takes time.
    message: 'Your league will review this. Nothing changes on your record until they do.',
  });
}
