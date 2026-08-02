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

  const now = new Date().toISOString();
  const openRounds = await adminDb.collection('fantasyRounds')
    .where('status', '==', 'open')
    .limit(250)
    .get();
  let lineupsLocked = 0;
  const lockableRounds = openRounds.docs.filter((round) =>
    typeof round.data().deadlineAt === 'string' && round.data().deadlineAt <= now,
  );
  for (const round of lockableRounds) {
    lineupsLocked += await lockFantasyRoundLineups(adminDb, round.id);
  }
  return Response.json({ roundsLocked: lockableRounds.length, lineupsLocked });
}
