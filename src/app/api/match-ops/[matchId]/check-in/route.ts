import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { parseJsonBody } from '@/server/api/security';
import { requireMatchOpsSession } from '@/server/matchOps/session';

export const runtime = 'nodejs';

const bodySchema = z.object({
  teams: z.record(z.string(), z.object({
    starting: z.array(z.string().trim().min(1)).max(30),
    bench: z.array(z.string().trim().min(1)).max(30),
    notPresent: z.array(z.string().trim().min(1)).max(30),
  })),
  packageVersion: z.string().trim().max(60),
});

/**
 * Lineups confirmed before kickoff, written as an immutable snapshot.
 *
 * Immutable because it is the answer to "who was available", asked before anybody knew what
 * would happen. A snapshot that could be edited at full time would let a squad be adjusted to
 * fit the events, which is the same defect as editing the score to fit the story.
 */
export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const auth = await requireMatchOpsSession(request, matchId);
  if ('response' in auth) return auth.response;

  const parsed = await parseJsonBody(request, bodySchema, { maxBytes: 16_384 });
  if ('response' in parsed) return Response.json({ error: 'Invalid lineup.' }, { status: 400 });

  const snapshotRef = adminDb.collection('matchLineupSnapshots').doc(matchId);
  const existing = await snapshotRef.get();
  if (existing.exists) {
    return Response.json(
      { error: 'Lineups have already been confirmed for this match.', lineupSnapshotId: matchId },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  await snapshotRef.create({
    id: matchId,
    matchId,
    assignmentId: auth.session.assignmentId,
    confirmedAt: now,
    teams: parsed.data.teams,
    packageVersion: parsed.data.packageVersion,
  });

  await adminDb.collection('fieldManagerAssignments').doc(auth.session.assignmentId).update({
    status: 'checked_in',
    updatedAt: FieldValue.serverTimestamp(),
  });

  return Response.json({ ok: true, lineupSnapshotId: matchId, confirmedAt: now });
}
