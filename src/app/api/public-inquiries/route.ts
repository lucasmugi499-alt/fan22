import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

const schema = z.object({
  type: z.enum(['sponsor', 'league_pilot']),
  name: z.string().trim().min(2).max(160),
  organization: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(7).max(30),
  sport: z.string().trim().min(1).max(60),
  region: z.string().trim().min(2).max(120),
  scale: z.string().trim().min(1).max(80),
  interest: z.string().trim().min(10).max(800),
  preferredContact: z.string().trim().min(1).max(30),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Complete every required field.' }, { status: 400 });
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const hour = new Date().toISOString().slice(0, 13);
  const rateId = createHash('sha256').update(`${forwarded}:${hour}`).digest('hex');
  const rateRef = adminDb.collection('publicInquiryRateLimits').doc(rateId);
  const inquiryRef = adminDb.collection('publicInquiries').doc();
  try {
    await adminDb.runTransaction(async (transaction) => {
      const rate = await transaction.get(rateRef);
      const count = Number(rate.data()?.count ?? 0);
      if (count >= 3) throw new Error('rate_limit');
      transaction.set(rateRef, {
        count: count + 1,
        expiresAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.create(inquiryRef, {
        id: inquiryRef.id,
        ...parsed.data,
        status: 'new',
        source: 'public_website',
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'rate_limit') {
      return Response.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }
    return Response.json({ error: 'The request could not be saved.' }, { status: 500 });
  }
  return Response.json({ id: inquiryRef.id }, { status: 201 });
}
