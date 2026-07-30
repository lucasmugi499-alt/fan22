import { adminDb } from '@/lib/firebase/admin';
import { lockFantasyRoundLineups } from '@/server/fantasy/scoringService';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const secret = process.env.GOALPLACE_FANTASY_SCORING_SECRET;
  if (!secret || request.headers.get('x-goalplace-fantasy-secret') !== secret) {
    return Response.json({ error: 'Trusted fantasy authorization required.' }, { status: 401 });
  }
  const openRounds = await adminDb.collection('fantasyRounds')
    .where('status', '==', 'open')
    .where('deadlineAt', '<=', new Date().toISOString())
    .limit(100)
    .get();
  let lineupsLocked = 0;
  for (const round of openRounds.docs) {
    lineupsLocked += await lockFantasyRoundLineups(adminDb, round.id);
  }
  return Response.json({ roundsLocked: openRounds.size, lineupsLocked });
}
