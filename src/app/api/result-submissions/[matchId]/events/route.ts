import { adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  try {
    const { matchId } = await params;
    const match = await adminDb.collection('matches').doc(matchId).get();
    if (!match.exists) return Response.json({ error: 'Match not found.' }, { status: 404 });
    const snapshot = await adminDb
      .collection('resultSubmissions')
      .doc(matchId)
      .collection('events')
      .orderBy('createdAt', 'asc')
      .get();
    return Response.json({
      events: snapshot.docs.map((document) => {
        const event = document.data();
        return {
          id: document.id,
          submissionId: matchId,
          from: event.from,
          to: event.to,
          actor: event.actor,
          createdAt: event.createdAt,
        };
      }),
    });
  } catch (error) {
    console.error('Public result provenance failed', error);
    return Response.json({ error: 'Result provenance is unavailable.' }, { status: 500 });
  }
}
