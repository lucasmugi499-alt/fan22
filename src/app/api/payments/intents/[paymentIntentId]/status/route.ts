import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ paymentIntentId: string }> },
) {
  const token = bearerToken(request);
  const actor = token ? await adminAuth.verifyIdToken(token).catch(() => null) : null;
  if (!actor) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const { paymentIntentId } = await context.params;
  const snapshot = await adminDb.collection('paymentIntents').doc(paymentIntentId).get();
  if (!snapshot.exists) return Response.json({ error: 'Payment intent not found.' }, { status: 404 });
  const intent = snapshot.data()!;
  const privileged = ['platform_admin', 'super_admin'].includes(String(actor.role ?? ''));
  if (intent.supporterUserId !== actor.uid && !privileged) {
    return Response.json({ error: 'You cannot view this payment intent.' }, { status: 403 });
  }
  return Response.json({
    id: snapshot.id,
    provider: intent.provider,
    status: intent.status,
    updatedAt: intent.updatedAt?.toDate?.()?.toISOString?.() ?? null,
  });
}
