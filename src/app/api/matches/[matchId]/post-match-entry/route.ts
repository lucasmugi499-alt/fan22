import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { hasCapabilityOrPlatformGrant } from '@/server/access/capabilities';
import { effectiveCapturePolicy, permitsPostMatchEntry, requiresFallbackReason } from '@/lib/capturePolicy';
import type { Match } from '@/types';

export const runtime = 'nodejs';

const bodySchema = z.object({
  homeScore: z.number().int().min(0).max(200),
  awayScore: z.number().int().min(0).max(200),
  scorers: z.array(z.object({
    athleteId: z.string().trim().min(1).max(180),
    teamId: z.string().trim().min(1).max(180),
    count: z.number().int().min(1).max(50),
    minute: z.number().int().min(0).max(200).optional(),
  })).max(60).default([]),
  evidenceRefs: z.array(z.string().trim().max(400)).max(10).default([]),
  /** Required where the competition treats a typed score as an exception. */
  reason: z.string().trim().max(500).optional(),
});

/**
 * A League Admin typing in a result after the match.
 *
 * Three independent checks, and none of them implies another. The capability asks whether
 * this principal may ever enter a result. The competition's bound policy asks whether it
 * permits one here. Holding `league.result.enter` in a FIELD_REQUIRED competition is a refusal
 * that authorization alone cannot see, and it is the whole reason policy binds to the fixture
 * rather than being read from the competition at result time: a policy tightened mid-season
 * must not retroactively invalidate matches captured legitimately under the old one.
 */
export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const mutation = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 16_384,
    invalidBodyError: 'A result needs both scores.',
    accountClass: ['organization_operator', 'platform_operator'],
    rateLimit: { bucket: 'post_match_entry', limit: 20, windowSeconds: 300, identity: () => [matchId] },
  });
  if ('response' in mutation) return mutation.response;
  const { actor, data } = mutation;

  const matchSnapshot = await adminDb.collection('matches').doc(matchId).get();
  if (!matchSnapshot.exists) return Response.json({ error: 'Match not found.' }, { status: 404 });
  const match = { id: matchSnapshot.id, ...matchSnapshot.data() } as Match;

  const permitted = await hasCapabilityOrPlatformGrant(
    actor.uid,
    { scopeType: 'league', scopeId: match.leagueId },
    'league.result.enter',
  );
  if (!permitted) return Response.json({ error: 'You cannot enter results for this league.' }, { status: 403 });

  /**
   * The policy bound onto this fixture when it was created, not the competition's current
   * setting. A fixture created before the field existed resolves to the permissive default,
   * which is what it was actually created under.
   */
  const policy = effectiveCapturePolicy(match.effectiveCapturePolicy, undefined);

  if (!permitsPostMatchEntry(policy)) {
    return Response.json({
      error: 'This competition requires the match to be captured on the pitch. Assign a Field Manager, or raise an emergency override with Platform.',
      effectiveCapturePolicy: policy,
    }, { status: 409 });
  }

  if (requiresFallbackReason(policy) && !data.reason?.trim()) {
    return Response.json({
      error: 'Field capture is the norm in this competition. Say why this result is being entered by hand.',
      effectiveCapturePolicy: policy,
    }, { status: 400 });
  }

  const existing = await adminDb.collection('matchReports').doc(matchId).get();
  if (existing.exists) {
    return Response.json({ error: 'This match already has a report.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  await adminDb.collection('matchReports').doc(matchId).set({
    id: matchId,
    matchId,
    leagueId: match.leagueId,
    // `league_post_match`, never `field_capture`. The provenance is what the quality tier
    // reads, and a typed score labelled as a capture would claim an observation that did not
    // happen.
    source: 'league_post_match',
    // Declared and reconstructed are the same number here, and deliberately so: there were no
    // events to reconstruct from. The omission detector only means something when two
    // independent records exist, and pretending otherwise would manufacture a reconciliation.
    declaredHomeScore: data.homeScore,
    declaredAwayScore: data.awayScore,
    reconstructedHomeScore: data.homeScore,
    reconstructedAwayScore: data.awayScore,
    eventCount: 0,
    payloadHash: '',
    clockAdjustments: [],
    attestedAt: now,
    attestationText: data.reason?.trim()
      ? `Entered after the match by the league. Reason: ${data.reason.trim()}`
      : 'Entered after the match by the league.',
    exceptions: [],
    status: 'submitted',
    resultVersion: 1,
    enteredByUserId: actor.uid,
    scorers: data.scorers,
    evidenceRefs: data.evidenceRefs,
    createdAt: now,
    updatedAt: now,
    updatedAtServer: FieldValue.serverTimestamp(),
  });

  return Response.json({
    ok: true,
    matchId,
    effectiveCapturePolicy: policy,
    // Said plainly: this result is trustworthy enough to publish and will never be Gold.
    dataQualityCeiling: 'bronze',
  });
}
