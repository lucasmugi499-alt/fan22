import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { validateFantasyActivation } from '@/lib/fantasy/activation';
import { positionGroupFor } from '@/lib/fantasy/profiles';
import type { AccessIndexDocument } from '@/lib/auth/access';
import type {
  FantasyCompetition,
  FantasyPlayer,
  FantasyPlayerPrice,
  FantasyRound,
  FantasyScoringProfile,
  FantasySquadRules,
} from '@/types/fantasy';
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

function normalizeFirestoreValue(
  id: string,
  data: FirebaseFirestore.DocumentData,
): Record<string, unknown> & { id: string } {
  return {
    id,
    ...Object.fromEntries(Object.entries(data).map(([key, value]) => [key, asSerializable(value)])),
  };
}

function asSerializable(value: unknown): unknown {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(asSerializable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, asSerializable(nested)]),
    );
  }
  return value;
}

async function scopedLeagueIdsForActor(userId: string) {
  try {
    const collection = adminDb.collection('accessIndex') as unknown as {
      where?: (field: string, op: FirebaseFirestore.WhereFilterOp, value: unknown) => {
        get: () => Promise<{ docs: Array<{ data: () => FirebaseFirestore.DocumentData }> }>;
      };
    };
    if (!collection.where) return new Set<string>();
    const snapshot = await collection.where('userId', '==', userId).get();
    return new Set(
      snapshot.docs
        .map((item) => item.data() as AccessIndexDocument)
        .filter((index) =>
          index.scopeType === 'league'
          && (
            index.capabilities?.includes('league.season.manage')
            || index.capabilities?.includes('league.profile.manage')
            || index.activeRoles?.some((role) => ['league_owner', 'league_admin', 'league_operator'].includes(role))
          ),
        )
        .map((index) => index.scopeId),
    );
  } catch {
    return new Set<string>();
  }
}

function legacyAdminIds(league: FirebaseFirestore.DocumentData | undefined) {
  return Array.isArray(league?.adminUserIds) ? league.adminUserIds.map(String) : [];
}

function canAdministerLeague(
  role: string | undefined,
  actorUid: string,
  leagueId: string,
  league: FirebaseFirestore.DocumentData | undefined,
  scopedLeagueIds: Set<string>,
) {
  if (role === 'platform_admin' || role === 'super_admin') return true;
  if (role !== 'league_admin') return false;
  return scopedLeagueIds.has(leagueId) || legacyAdminIds(league).includes(actorUid);
}

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;
  const actor = auth.actor;
  const profile = await adminDb.collection('users').doc(actor.uid).get();
  const role = (actor.role ?? profile.data()?.role) as string | undefined;
  if (!['league_admin', 'platform_admin', 'super_admin'].includes(role ?? '')) {
    return Response.json({ error: 'League or platform administration access required.' }, { status: 403 });
  }

  const [
    leaguesSnapshot,
    seasonsSnapshot,
    competitionsSnapshot,
    profilesSnapshot,
    rulesSnapshot,
    playersSnapshot,
    pricesSnapshot,
    roundsSnapshot,
    scopedLeagueIds,
  ] = await Promise.all([
    adminDb.collection('leagues').get(),
    adminDb.collection('seasons').get(),
    adminDb.collection('fantasyCompetitions').get(),
    adminDb.collection('fantasyScoringProfiles').get(),
    adminDb.collection('fantasySquadRules').get(),
    adminDb.collection('fantasyPlayers').get(),
    adminDb.collection('fantasyPlayerPrices').get(),
    adminDb.collection('fantasyRounds').get(),
    role === 'league_admin' ? scopedLeagueIdsForActor(actor.uid) : Promise.resolve(new Set<string>()),
  ]);
  const allLeagues = leaguesSnapshot.docs.map((item) => normalizeFirestoreValue(item.id, item.data()));
  const visibleLeagues = role === 'league_admin'
    ? allLeagues.filter((league) =>
      canAdministerLeague(role, actor.uid, String(league.id), league, scopedLeagueIds),
    )
    : allLeagues;
  const visibleLeagueIds = new Set(visibleLeagues.map((league) => String(league.id)));
  const competitions = competitionsSnapshot.docs
    .map((item) => normalizeFirestoreValue(item.id, item.data()))
    .filter((competition) => visibleLeagueIds.has(String(competition.leagueId)));
  const scoringProfiles = profilesSnapshot.docs.map((item) => normalizeFirestoreValue(item.id, item.data()));
  const squadRules = rulesSnapshot.docs.map((item) => normalizeFirestoreValue(item.id, item.data()));
  const players = playersSnapshot.docs.map((item) => normalizeFirestoreValue(item.id, item.data()));
  const prices = pricesSnapshot.docs.map((item) => normalizeFirestoreValue(item.id, item.data()));
  const rounds = roundsSnapshot.docs.map((item) => normalizeFirestoreValue(item.id, item.data()));
  const readinessByCompetition = Object.fromEntries(
    competitions.map((competition) => [
      String(competition.id),
      validateFantasyActivation({
        competition: competition as unknown as FantasyCompetition,
        scoringProfile: scoringProfiles.find((profile) =>
          String(profile.id) === String(competition.scoringProfileId),
        ) as unknown as FantasyScoringProfile | undefined ?? null,
        squadRules: squadRules.find((rules) =>
          String(rules.id) === String(competition.squadRulesId),
        ) as unknown as FantasySquadRules | undefined ?? null,
        players: players.filter((player) =>
          String(player.competitionId) === String(competition.id),
        ) as unknown as FantasyPlayer[],
        prices: prices.filter((price) =>
          String(price.competitionId) === String(competition.id),
        ) as unknown as FantasyPlayerPrice[],
        rounds: rounds.filter((round) =>
          String(round.competitionId) === String(competition.id),
        ) as unknown as FantasyRound[],
      }),
    ]),
  );

  return Response.json({
    role,
    leagues: visibleLeagues,
    seasons: seasonsSnapshot.docs
      .map((item) => normalizeFirestoreValue(item.id, item.data()))
      .filter((season) => visibleLeagueIds.has(String(season.leagueId))),
    competitions,
    scoringProfiles,
    squadRules,
    readinessByCompetition,
  }, { headers: { 'cache-control': 'no-store' } });
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
      && !canAdministerLeague(
        role,
        actor.uid,
        input.leagueId,
        league.data(),
        await scopedLeagueIdsForActor(actor.uid),
      )
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
    adminDb.collection('fantasyRounds').where('competitionId', '==', competition.id).get(),
  ]);
  const readiness = validateFantasyActivation({
    competition: { id: competition.id, ...competition.data()! } as FantasyCompetition,
    scoringProfile: profileSnapshot.exists
      ? { id: profileSnapshot.id, ...profileSnapshot.data()! } as FantasyScoringProfile
      : null,
    squadRules: rulesSnapshot.exists
      ? { id: rulesSnapshot.id, ...rulesSnapshot.data()! } as FantasySquadRules
      : null,
    players: playersSnapshot.docs.map((player) =>
      ({ id: player.id, ...player.data()! } as FantasyPlayer),
    ),
    prices: pricesSnapshot.docs.map((price) =>
      ({ id: price.id, ...price.data()! } as FantasyPlayerPrice),
    ),
    rounds: roundsSnapshot.docs.map((round) =>
      ({ id: round.id, ...round.data()! } as FantasyRound),
    ).sort((left, right) => left.number - right.number),
  });
  if (!readiness.ready) {
    return Response.json({
      error: 'Roster, rounds, or locked scoring configuration is incomplete.',
      blockers: readiness.blockers,
    }, { status: 409 });
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
    activationReadiness: readiness.summary,
    activationWarnings: readiness.warnings,
    activatedAt: FieldValue.serverTimestamp(),
  });
  await adminDb.collection('fantasyAuditEvents').add({
    action: 'competition_activated',
    competitionId: competition.id,
    actorUserId: actor.uid,
    actorRole: role,
    scoringProfileId: competition.data()!.scoringProfileId,
    scoringProfileVersion: competition.data()!.scoringProfileVersion,
    readiness: readiness.summary,
    warnings: readiness.warnings,
    createdAt: FieldValue.serverTimestamp(),
  });
  return Response.json({ id: competition.id, status: 'active', readiness: readiness.summary });
}
