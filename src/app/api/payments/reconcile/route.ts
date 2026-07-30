import { requireSchedulerRequest } from '@/server/api/security';
import { reconcileProcessingPayments } from '@/server/payments/reconciliation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const unauthorized = await requireSchedulerRequest(request, {
    operation: 'payment_reconciliation',
    legacySecretHeader: 'x-goalplace-reconciliation-secret',
    legacySecretEnv: 'GOALPLACE_RECONCILIATION_SECRET',
  });
  if (unauthorized) return unauthorized;

  if (process.env.GOALPLACE_PAYMENTS_MODE !== 'sandbox') {
    return Response.json({ error: 'Payment reconciliation remains sandbox-only.' }, { status: 503 });
  }
  const outcomes = await reconcileProcessingPayments();
  return Response.json({ processed: outcomes.length, outcomes });
}
