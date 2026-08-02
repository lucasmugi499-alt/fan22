import { adminDb } from '@/lib/firebase/admin';
import { clientIpFrom, enforceRateLimit, jsonError } from '@/server/api/security';

export const runtime = 'nodejs';

const publicEventStates = new Set([
  'pending_confirmation',
  'confirmation_overdue',
  'confirmed',
  'disputed',
  'rejected',
  'official',
  'superseded',
  'withdrawn',
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  try {
    const { matchId } = await params;
    if (!matchId || matchId.length > 180 || matchId.includes('/')) {
      return jsonError('Match not found.', 404);
    }
    const limited = await enforceRateLimit({
      bucket: 'public_result_provenance',
      identity: [clientIpFrom(request), matchId],
      limit: 120,
      windowSeconds: 60,
    });
    if (limited) return limited;

    const match = await adminDb.collection('matches').doc(matchId).get();
    if (!match.exists) return jsonError('Match not found.', 404);
    const snapshot = await adminDb
      .collection('resultSubmissions')
      .doc(matchId)
      .collection('events')
      .orderBy('createdAt', 'asc')
      .limit(50)
      .get();
    return Response.json({
      events: snapshot.docs.map((document) => {
        const event = document.data();
        const to = String(event.to ?? '');
        if (!publicEventStates.has(to) || event.public === false || event.internalOnly === true) return null;
        return {
          id: document.id,
          submissionId: matchId,
          from: event.from,
          to,
          actor: event.actor === 'system' ? 'system' : String(event.actor ?? 'operator'),
          createdAt: event.createdAt,
        };
      }).filter(Boolean),
    }, {
      headers: {
        'cache-control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('Public result provenance failed', error);
    return jsonError('Result provenance is unavailable.', 500);
  }
}
