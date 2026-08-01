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
  applicantName: z.string().trim().min(2).max(160),
  applicantPhone: z.string().trim().min(7).max(30).optional().or(z.literal('')),
  applicantEmail: z.string().trim().email().max(200),
  leagueName: z.string().trim().min(2).max(160),
  sport: z.enum(['football', 'basketball', 'rugby']),
  city: z.string().trim().min(2).max(120),
  evidenceNote: z.string().trim().min(10).max(1200),
});

export async function POST(request: Request) {
  const appCheck = await verifyOptionalAppCheck(request);
  if ('response' in appCheck) return appCheck.response;

  const parsed = await parseJsonBody(request, schema, { maxBytes: 8 * 1024 });
  if ('response' in parsed) {
    return Response.json({ error: 'Complete every required field.' }, { status: parsed.response.status });
  }

  const input = parsed.data;
  const normalizedSetupEmail = input.applicantEmail.trim().toLowerCase();
  const normalizedPhone = input.applicantPhone?.replace(/[^\d+]/g, '') ?? '';
  const clientIp = clientIpFrom(request);
  const duplicateKey = `${normalizedSetupEmail}:${input.leagueName.trim().toLowerCase()}:${input.city.trim().toLowerCase()}`;
  const limited = await enforceRateLimit({
    bucket: 'league-admin-applications',
    identity: [clientIp, appCheck.appId, duplicateKey],
    limit: 3,
    windowSeconds: 60 * 60,
  });
  if (limited) return limited;

  const applicationRef = adminDb.collection('leagueAdminApplications').doc();
  try {
    await adminDb.runTransaction(async (transaction) => {
      transaction.create(applicationRef, {
        id: applicationRef.id,
        userId: `public_applicant_${sha256(`${normalizedSetupEmail}:${applicationRef.id}`).slice(0, 16)}`,
        applicantName: input.applicantName.trim(),
        applicantEmail: normalizedSetupEmail,
        ...(normalizedPhone ? { applicantPhone: normalizedPhone } : {}),
        leagueName: input.leagueName.trim(),
        sport: input.sport,
        city: input.city.trim(),
        evidenceNote: input.evidenceNote.trim(),
        status: 'pending',
        source: 'public_league_application',
        appCheckAppId: appCheck.appId,
        clientIpHash: clientIp === 'unknown' ? null : sha256(clientIp),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch {
    return Response.json({ error: 'The application could not be saved.' }, { status: 500 });
  }

  return Response.json({ id: applicationRef.id }, { status: 201 });
}
