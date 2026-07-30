import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { positionGroupFor } from '@/lib/fantasy/profiles';
import type { FantasySquadRules } from '@/types/fantasy';
import { parseJsonBody, requireAuthenticatedUser } from '@/server/api/security';

export const runtime = 'nodejs';

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('propose'),
    name: z.string().trim().min(5).max(80),
    shortName: z.string().trim().min(3).max(30),
    sport: z.enum(['football', 'basketball', 'rugby']),
    variant: z.string().trim().min(1).max(80),
    leagueId: z.string().trim().min(1).max(180),
    seasonId: z.string().trim().min(1).max(180),
    scoringProfileId: z.string().trim().min(1).max(180),
    squadRulesId: z.string().trim().min(1).max(180),
    dataLevel: z.enum(['basic', 'standard', 'advanced']),
    recordedStatKeys: z.array(z.string().trim().min(1).max(80)).min(1).max(80),
  }),
  z.object({
    action: z.literal('activate'),
    competitionId: z.string().trim().min(1).max(180),
  }),
]);

function asIso(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return String(value);
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;
  const parsed = await parseJsonBody(request, requestSchema, { maxBytes: 8 * 1024 });
  if ('response' in parsed) return Response.json({ error: 'Invalid fantasy administration request.' }, { status: parsed.response.status });
  const actor = auth.actor;
  const profile = await adminDb.collection('users').doc(actor.uid).get();
  const role = (actor.role ?? profile.data()?.role) as string | undefined;

  if (parsed.data.action === 'propose') {
    const input = parsed.data;
    if (!['league_admin', 'platform_admin', 'super_admin'].includes(role ?? '')) {
      return Response.json({ error: 'League administration access required.' }, { status: 403 });
    }
    const [league, season, scoringProfile, squadRules] = await Promise.all([
      adminDb.collection('leagues').doc(input.leagueId).get(),
      adminDb.collection('seasons').doc(input.seasonId).get(),
      adminDb.collection('fantasyScoringProfiles').doc(input.scoringProfileId).get(),
      adminDb.collection('fantasySquadRules').doc(input.squadRulesId).get(),
    ]);
    if (!league.exists || !season.exists || !scoringProfile.exists || !squadRules.exists) {
      return Response.json({ error: 'League, season, or approved fantasy configuration was not found.' }, { status: 404 });
    }
    if (
      season.data()?.leagueId !== input.leagueId
      || season.data()?.sport !== input.sport
      || String(league.data()?.sport).toLowerCase() !== input.sport
    ) {
      return Response.json({ error: 'League, season, and fantasy sport must match.' }, { status: 409 });
    }
    if (
      role === 'league_admin'
      && !(Array.isArray(league.data()?.adminUserIds) && league.data()!.adminUserIds.includes(actor.uid))
    ) {
      return Response.json({ error: 'You do not administer this league.' }, { status: 403 });
    }
    if (
      scoringProfile.data()?.status !== 'approved'
      || scoringProfile.data()?.sport !== input.sport
      || squadRules.data()?.sport !== input.sport
      || squadRules.data()?.variant !== input.variant
    ) {
      return Response.json({ error: 'Choose an approved scoring profile and matching squad rules.' }, { status: 409 });
    }
    const competitionRef = adminDb.collection('fantasyCompetitions').doc();
    const [athletes, leagueMatches] = await Promise.all([
      adminDb.collection('athletes')
        .where('leagueId', '==', input.leagueId)
        .get(),
      adminDb.collection('matches')
        .where('leagueId', '==', input.leagueId)
        .get(),
    ]);
    const rules = { id: squadRules.id, ...squadRules.data()! } as FantasySquadRules;
    const eligibleAthletes = athletes.docs.flatMap((athlete) => {
      const positionGroup = positionGroupFor(rules, String(athlete.data().position ?? ''));
      return positionGroup ? [{ athlete, positionGroup }] : [];
    });
    const seasonMatches = leagueMatches.docs
      .filter((match) => match.data().seasonId === input.seasonId)
      .sort((left, right) =>
        asIso(left.data().scheduledAt).localeCompare(asIso(right.data().scheduledAt)),
      );
    const matchesByDate = new Map<string, typeof seasonMatches>();
    for (const match of seasonMatches) {
      const dateKey = asIso(match.data().scheduledAt).slice(0, 10);
      matchesByDate.set(dateKey, [...(matchesByDate.get(dateKey) ?? []), match]);
    }
    await competitionRef.set({
      id: competitionRef.id,
      ...input,
      scoringProfileVersion: scoringProfile.data()!.version,
      status: 'proposed',
      isFreeToPlay: true,
      creditsLabel: 'Fantasy Credits',
      rosterReadiness: eligibleAthletes.length,
      roundReadiness: matchesByDate.size,
      proposedByUserId: actor.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    const writer = adminDb.bulkWriter();
    eligibleAthletes.forEach(({ athlete, positionGroup }, index) => {
      const playerRef = adminDb.collection('fantasyPlayers')
        .doc(`${competitionRef.id}_${athlete.id}`);
      const priceRef = adminDb.collection('fantasyPlayerPrices')
        .doc(`${competitionRef.id}_${athlete.id}_v1`);
      writer.create(playerRef, {
        id: playerRef.id,
        competitionId: competitionRef.id,
        athleteId: athlete.id,
        realTeamId: athlete.data().teamId,
        sport: input.sport,
        position: athlete.data().position,
        positionGroup,
        availability: 'available',
        verifiedRecentForm: [],
        ownershipPercentage: 0,
        active: true,
        createdAt: FieldValue.serverTimestamp(),
      });
      writer.create(priceRef, {
        id: priceRef.id,
        competitionId: competitionRef.id,
        athleteId: athlete.id,
        credits: 5 + (index % 8),
        version: 1,
        status: 'draft',
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    [...matchesByDate.entries()].forEach(([dateKey, matches], index) => {
      const startsAt = asIso(matches[0].data().scheduledAt);
      const endsAt = new Date(
        Math.max(...matches.map((match) => Date.parse(asIso(match.data().scheduledAt))))
        + 4 * 60 * 60 * 1000,
      ).toISOString();
      const roundRef = adminDb.collection('fantasyRounds')
        .doc(`${competitionRef.id}_round_${index + 1}`);
      writer.create(roundRef, {
        id: roundRef.id,
        competitionId: competitionRef.id,
        number: index + 1,
        name: `Round ${index + 1}`,
        matchIds: matches.map((match) => match.id),
        startsAt,
        deadlineAt: startsAt,
        endsAt,
        status: 'upcoming',
        sourceDate: dateKey,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    await writer.close();
    return Response.json({
      id: competitionRef.id,
      status: 'proposed',
      rosterReadiness: eligibleAthletes.length,
      roundReadiness: matchesByDate.size,
    }, { status: 201 });
  }

  if (!['platform_admin', 'super_admin'].includes(role ?? '')) {
    return Response.json({ error: 'Platform approval is required for public activation.' }, { status: 403 });
  }
  const competitionRef = adminDb.collection('fantasyCompetitions').doc(parsed.data.competitionId);
  const competition = await competitionRef.get();
  if (!competition.exists || !['proposed', 'approved'].includes(competition.data()?.status)) {
    return Response.json({ error: 'Only a reviewed proposal may be activated.' }, { status: 409 });
  }
  const [profileSnapshot, rulesSnapshot, playersSnapshot, pricesSnapshot, roundsSnapshot] = await Promise.all([
    adminDb.collection('fantasyScoringProfiles').doc(competition.data()!.scoringProfileId).get(),
    adminDb.collection('fantasySquadRules').doc(competition.data()!.squadRulesId).get(),
    adminDb.collection('fantasyPlayers').where('competitionId', '==', competition.id).get(),
    adminDb.collection('fantasyPlayerPrices').where('competitionId', '==', competition.id).get(),
    adminDb.collection('fantasyRounds').where('competitionId', '==', competition.id).count().get(),
  ]);
  if (
    profileSnapshot.data()?.status !== 'approved'
    || !rulesSnapshot.exists
    || playersSnapshot.size < Number(rulesSnapshot.data()?.squadSize ?? 1)
    || pricesSnapshot.size < playersSnapshot.size
    || roundsSnapshot.data().count < 1
  ) {
    return Response.json({ error: 'Roster, rounds, or locked scoring configuration is incomplete.' }, { status: 409 });
  }
  const publishedAt = new Date().toISOString();
  const priceWriter = adminDb.bulkWriter();
  pricesSnapshot.docs.forEach((price) => {
    priceWriter.update(price.ref, {
      status: 'published',
      publishedAt,
    });
  });
  await priceWriter.close();
  await competitionRef.update({
    status: 'active',
    approvedByUserId: actor.uid,
    activatedAt: FieldValue.serverTimestamp(),
  });
  await adminDb.collection('fantasyAuditEvents').add({
    action: 'competition_activated',
    competitionId: competition.id,
    actorUserId: actor.uid,
    actorRole: role,
    scoringProfileId: competition.data()!.scoringProfileId,
    scoringProfileVersion: competition.data()!.scoringProfileVersion,
    createdAt: FieldValue.serverTimestamp(),
  });
  return Response.json({ id: competition.id, status: 'active' });
}
