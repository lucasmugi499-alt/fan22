import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { canRequestTrustedFinalization } from '@/lib/resultSubmission';
import { finalizeSubmission } from '@/server/resultFinalizer';
import type { ResultSubmission } from '@/types';

export const runtime = 'nodejs';

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const token = bearerToken(request);
  if (!token) {
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const actor = await adminAuth.verifyIdToken(token).catch(() => null);
  if (!actor) {
    return Response.json({ error: 'Your session is invalid or expired.' }, { status: 401 });
  }

  try {
    const { matchId } = await params;
    const snapshot = await adminDb.collection('resultSubmissions').doc(matchId).get();
    if (!snapshot.exists) {
      return Response.json({ error: 'Result submission not found.' }, { status: 404 });
    }

    const submission = {
      id: snapshot.id,
      ...snapshot.data(),
    } as ResultSubmission;
    if (
      !canRequestTrustedFinalization(submission, {
        uid: actor.uid,
        role: typeof actor.role === 'string' ? actor.role : undefined,
      })
    ) {
      return Response.json(
        { error: 'You did not settle this result submission.' },
        { status: 403 }
      );
    }

    if (submission.status === 'official') {
      return Response.json({ action: 'skipped', reason: 'already_finalized' });
    }
    if (submission.status !== 'confirmed') {
      return Response.json(
        { error: 'This result is not ready for finalization.' },
        { status: 409 }
      );
    }

    return Response.json(await finalizeSubmission(adminDb, matchId));
  } catch (error) {
    console.error('Trusted result finalization failed', error);
    return Response.json(
      { error: 'GoalPlace256 could not finalize this result.' },
      { status: 500 }
    );
  }
}
