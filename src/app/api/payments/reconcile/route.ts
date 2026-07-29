import { timingSafeEqual } from 'node:crypto';
import { reconcileProcessingPayments } from '@/server/payments/reconciliation';

export const runtime = 'nodejs';

function authorized(supplied: string | null) {
  const expected = process.env.GOALPLACE_RECONCILIATION_SECRET;
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get('x-goalplace-reconciliation-secret'))) {
    return Response.json({ error: 'Unauthorized reconciliation request.' }, { status: 401 });
  }
  if (process.env.GOALPLACE_PAYMENTS_MODE !== 'sandbox') {
    return Response.json({ error: 'Payment reconciliation remains sandbox-only.' }, { status: 503 });
  }
  const outcomes = await reconcileProcessingPayments();
  return Response.json({ processed: outcomes.length, outcomes });
}
