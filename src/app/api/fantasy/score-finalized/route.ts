import { adminDb } from '@/lib/firebase/admin';
import { scoreFinalizedFantasyMatch } from '@/server/fantasy/scoringService';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const secret = process.env.GOALPLACE_FANTASY_SCORING_SECRET;
  if (!secret || request.headers.get('x-goalplace-fantasy-secret') !== secret) {
    return Response.json({ error: 'Trusted fantasy scoring authorization required.' }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as { matchId?: unknown } | null;
  if (!body || typeof body.matchId !== 'string' || !body.matchId) {
    return Response.json({ error: 'A matchId is required.' }, { status: 400 });
  }
  try {
    return Response.json(await scoreFinalizedFantasyMatch(adminDb, body.matchId));
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Fantasy scoring failed.',
    }, { status: 409 });
  }
}
