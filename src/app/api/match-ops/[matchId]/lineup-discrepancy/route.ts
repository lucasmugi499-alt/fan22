import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { parseJsonBody } from '@/server/api/security';
import { requireMatchOpsSession } from '@/server/matchOps/session';

export const runtime = 'nodejs';

const bodySchema = z.object({
  teamId: z.string().trim().min(1).max(180),
  detail: z.string().trim().min(3).max(400),
  shirtNumber: z.string().trim().max(10).optional(),
});

/**
 * "Player not listed."
 *
 * This opens an exception. It does not open a registration form, and that distinction is the
 * whole point: a Field Manager never registers an athlete. Match-day pressure is exactly the
 * condition under which somebody types a name to get the game started, and a roster that
 * accepts entries under that pressure becomes fiction within a season.
 *
 * The exception is non-blocking. A missing player is worth telling the League about, and it is
 * not a reason to refuse a match that was otherwise captured properly.
 */
export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const auth = await requireMatchOpsSession(request, matchId);
  if ('response' in auth) return auth.response;

  const parsed = await parseJsonBody(request, bodySchema, { maxBytes: 2_048 });
  if ('response' in parsed) return Response.json({ error: 'Tell us who is missing.' }, { status: 400 });

  const now = new Date().toISOString();
  const exceptionId = `${matchId}_lineup_discrepancy_${parsed.data.teamId}`;
  await adminDb.collection('matchOperationalExceptions').doc(exceptionId).set({
    id: exceptionId,
    matchId,
    leagueId: auth.session.leagueId,
    code: 'lineup_discrepancy_reported',
    blocking: false,
    detail: { ...parsed.data, reportedByAssignmentId: auth.session.assignmentId },
    status: 'open',
    createdAt: now,
    updatedAt: now,
  }, { merge: true });

  return Response.json({
    ok: true,
    // Said plainly, because the Field Manager needs to know what to do next: keep going.
    message: 'Reported to your league. Carry on with the match; they will sort the registration.',
  });
}
