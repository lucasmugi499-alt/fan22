import { jsonError, requireAuthenticatedUser } from '@/server/api/security';
import { resolveTrustedAccessContext } from '@/server/access/resolver';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;

  try {
    const context = await resolveTrustedAccessContext(auth.actor.uid);
    return Response.json(context, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (cause) {
    console.error('GoalPlace256: trusted access context failed.', cause);
    return jsonError('Scoped access context is unavailable.', 503);
  }
}
