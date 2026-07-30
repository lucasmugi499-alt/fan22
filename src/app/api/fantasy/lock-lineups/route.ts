import { adminDb } from '@/lib/firebase/admin';
import { requireSchedulerRequest } from '@/server/api/security';
import { lockFantasyRoundLineups } from '@/server/fantasy/scoringService';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const unauthorized = await requireSchedulerRequest(request, {
    operation: 'fantasy_lineup_lock',
    legacySecretHeader: 'x-goalplace-fantasy-secret',
    legacySecretEnv: 'GOALPLACE_FANTASY_SCORING_SECRET',
  });
  if (unauthorized) return unauthorized;

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
