import { adminDb } from '@/lib/firebase/admin';
import { parseJsonBody, requireSchedulerRequest } from '@/server/api/security';
import { scoreFinalizedFantasyMatch } from '@/server/fantasy/scoringService';
import { z } from 'zod';

export const runtime = 'nodejs';

const schema = z.object({ matchId: z.string().min(1).max(160) });

export async function POST(request: Request) {
  const unauthorized = await requireSchedulerRequest(request, {
    operation: 'fantasy_score_finalized_match',
    legacySecretHeader: 'x-goalplace-fantasy-secret',
    legacySecretEnv: 'GOALPLACE_FANTASY_SCORING_SECRET',
  });
  if (unauthorized) return unauthorized;

  const body = await parseJsonBody(request, schema, { maxBytes: 1024 });
  if ('response' in body) return Response.json({ error: 'A matchId is required.' }, { status: body.response.status });

  try {
    return Response.json(await scoreFinalizedFantasyMatch(adminDb, body.data.matchId));
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Fantasy scoring failed.',
    }, { status: 409 });
  }
}
