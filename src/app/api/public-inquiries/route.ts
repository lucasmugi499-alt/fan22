import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { clientIpFrom, enforceRateLimit, parseJsonBody, verifyOptionalAppCheck } from '@/server/api/security';

export const runtime = 'nodejs';

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

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
  website: z.string().max(0).optional(),
});

export async function POST(request: Request) {
  const appCheck = await verifyOptionalAppCheck(request);
  if ('response' in appCheck) return appCheck.response;

  const parsed = await parseJsonBody(request, schema, { maxBytes: 8 * 1024 });
  if ('response' in parsed) {
    return Response.json({ error: 'Complete every required field.' }, { status: parsed.response.status });
  }

  const input = parsed.data;
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedPhone = input.phone.replace(/[^\d+]/g, '');
  const clientIp = clientIpFrom(request);
  const duplicateKey = `${input.type}:${normalizedEmail}:${normalizedPhone}:${input.organization.trim().toLowerCase()}`;
  const limited = await enforceRateLimit({
    bucket: 'public-inquiries',
    identity: [clientIp, appCheck.appId, duplicateKey],
    limit: 3,
    windowSeconds: 60 * 60,
  });
  if (limited) return limited;

  const inquiryRef = adminDb.collection('publicInquiries').doc();
  try {
    await adminDb.runTransaction(async (transaction) => {
      transaction.create(inquiryRef, {
        id: inquiryRef.id,
        ...input,
        email: normalizedEmail,
        phone: normalizedPhone,
        status: 'new',
        source: 'public_website',
        appCheckAppId: appCheck.appId,
        clientIpHash: clientIp === 'unknown' ? null : sha256(clientIp),
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  } catch {
    return Response.json({ error: 'The request could not be saved.' }, { status: 500 });
  }
  return Response.json({ id: inquiryRef.id }, { status: 201 });
}
