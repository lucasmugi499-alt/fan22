import 'server-only';
import { adminDb } from '@/lib/firebase/admin';
import {
  fantasyCompetitionBundle,
  fantasyCompetitions,
  fantasyLeaderboards,
  fantasyMiniLeagueMembers,
  fantasyMiniLeagues,
  fantasyPlayerCards,
} from '@/data/fantasyDemo';
import type {
  FantasyCompetition,
  FantasyLeaderboardEntry,
  FantasyMiniLeague,
  FantasyMiniLeagueMember,
  FantasyPlayer,
  FantasyPlayerPrice,
  FantasyPointEvent,
  FantasyRound,
} from '@/types/fantasy';
import type { Athlete, League, Team } from '@/types';
import { resolveFantasyCompetitions } from '@/lib/fantasy/catalogue';

function usesFirebaseFantasy() {
  return (
    process.env.NEXT_PUBLIC_DATA_MODE === 'firebase'
    && process.env.NEXT_STATIC_EXPORT !== 'true'
  );
}

function record<T>(id: string, data: FirebaseFirestore.DocumentData) {
  return normalize({ id, ...data }) as T;
}

function normalize(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if ('toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(normalize);
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, normalize(nested)]),
  );
}

async function collection<T>(
  name: string,
  field: string,
  value: string,
) {
  const snapshot = await adminDb.collection(name).where(field, '==', value).get();
  return snapshot.docs.map((item) => record<T>(item.id, item.data()));
}

export async function getFantasyCompetitions() {
  if (!usesFirebaseFantasy()) return fantasyCompetitions;
  try {
    const snapshot = await adminDb.collection('fantasyCompetitions')
      .where('status', '==', 'active')
      .get();
    return resolveFantasyCompetitions(snapshot.docs.map((item) =>
      record<FantasyCompetition>(item.id, item.data()),
    ));
  } catch (cause) {
    if (process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN !== 'true') throw cause;
    return fantasyCompetitions;
  }
}

export async function getFantasyHubCatalogue() {
  const competitions = await getFantasyCompetitions();
  if (!usesFirebaseFantasy()) {
    return {
      competitions,
      leagueNames: Object.fromEntries(
        competitions.map((competition) => [
          competition.leagueId,
          fantasyCompetitionBundle(competition.id)?.league?.name ?? 'GoalPlace256 league',
        ]),
      ),
    };
  }
  const fallbackNames = Object.fromEntries(
    competitions.map((competition) => [
      competition.leagueId,
      fantasyCompetitionBundle(competition.id)?.league?.name ?? 'GoalPlace256 league',
    ]),
  );
  const leagueSnapshots = await Promise.all(
    [...new Set(competitions.map((competition) => competition.leagueId))]
      .map((leagueId) => adminDb.collection('leagues').doc(leagueId).get()),
  ).catch((cause) => {
    if (process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN !== 'true') throw cause;
    return [];
  });
  return {
    competitions,
    leagueNames: {
      ...fallbackNames,
      ...Object.fromEntries(
        leagueSnapshots
        .filter((league) => league.exists)
        .map((league) => [league.id, String(league.data()?.name ?? 'GoalPlace256 league')]),
      ),
    },
  };
}

export async function getFantasyCompetitionBundle(competitionId: string) {
  if (!usesFirebaseFantasy()) return fantasyCompetitionBundle(competitionId);
  try {
    const competitionSnapshot = await adminDb.collection('fantasyCompetitions')
      .doc(competitionId)
      .get();
    if (!competitionSnapshot.exists) return fantasyCompetitionBundle(competitionId);
    const competition = record<FantasyCompetition>(
      competitionSnapshot.id,
      competitionSnapshot.data()!,
    );
    const [leagueSnapshot, rounds, players, prices, leaderboard, pointEvents] = await Promise.all([
      adminDb.collection('leagues').doc(competition.leagueId).get(),
      collection<FantasyRound>('fantasyRounds', 'competitionId', competitionId),
      collection<FantasyPlayer>('fantasyPlayers', 'competitionId', competitionId),
      collection<FantasyPlayerPrice>('fantasyPlayerPrices', 'competitionId', competitionId),
      collection<FantasyLeaderboardEntry>('fantasyLeaderboards', 'competitionId', competitionId),
      collection<FantasyPointEvent>('fantasyPointEvents', 'competitionId', competitionId),
    ]);
    return {
      competition,
      league: leagueSnapshot.exists
        ? record<League>(leagueSnapshot.id, leagueSnapshot.data()!)
        : undefined,
      rounds: rounds.sort((left, right) => left.number - right.number),
      players,
      prices,
      leaderboard: leaderboard.sort((left, right) => left.rank - right.rank),
      pointEvents,
    };
  } catch (cause) {
    if (process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN !== 'true') throw cause;
    return fantasyCompetitionBundle(competitionId);
  }
}

export async function getFantasyPlayerCards(competitionId: string) {
  if (!usesFirebaseFantasy()) return fantasyPlayerCards(competitionId);
  try {
    const bundle = await getFantasyCompetitionBundle(competitionId);
    if (!bundle) return [];
    const [athletes, teams] = await Promise.all([
      collection<Athlete>('athletes', 'leagueId', bundle.competition.leagueId),
      collection<Team>('teams', 'leagueId', bundle.competition.leagueId),
    ]);
    const athleteById = new Map(athletes.map((athlete) => [athlete.id, athlete]));
    const teamById = new Map(teams.map((team) => [team.id, team]));
    const priceByAthlete = new Map(
      bundle.prices
        .filter((price) => price.status === 'published')
        .map((price) => [price.athleteId, price.credits]),
    );
    return bundle.players.flatMap((player) => {
      const athlete = athleteById.get(player.athleteId);
      if (!athlete) return [];
      return [{
        ...player,
        name: athlete.name,
        avatarUrl: athlete.avatarUrl ?? '/demo/assets/avatars/avatar_01.svg',
        teamName: teamById.get(player.realTeamId)?.name ?? 'Independent',
        credits: priceByAthlete.get(player.athleteId) ?? 0,
      }];
    });
  } catch (cause) {
    if (process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN !== 'true') throw cause;
    return fantasyPlayerCards(competitionId);
  }
}

export async function getFantasyMiniLeagueCatalogue() {
  if (!usesFirebaseFantasy()) {
    const memberCounts = fantasyMiniLeagueMembers.reduce<Record<string, number>>((counts, member) => {
      if (member.status === 'active') counts[member.miniLeagueId] = (counts[member.miniLeagueId] ?? 0) + 1;
      return counts;
    }, {});
    return {
      miniLeagues: fantasyMiniLeagues,
      memberCounts,
    };
  }
  const publicLeagues = await adminDb.collection('fantasyMiniLeagues')
    .where('visibility', '==', 'public')
    .where('status', '==', 'active')
    .limit(20)
    .get();
  const miniLeagues = publicLeagues.docs.map((item) =>
    record<FantasyMiniLeague>(item.id, item.data()),
  );
  const memberCounts = Object.fromEntries(await Promise.all(
    miniLeagues.map(async (league) => {
      const countSnapshot = await adminDb.collection('fantasyMiniLeagueMembers')
        .where('miniLeagueId', '==', league.id)
        .where('status', '==', 'active')
        .count()
        .get();
      return [league.id, countSnapshot.data().count] as const;
    }),
  ));
  return {
    miniLeagues,
    memberCounts,
  };
}

export async function getFantasyMiniLeague(miniLeagueId: string) {
  if (!usesFirebaseFantasy()) {
    const league = fantasyMiniLeagues.find((item) => item.id === miniLeagueId);
    if (!league) return null;
    return {
      league,
      members: fantasyMiniLeagueMembers.filter((item) => item.miniLeagueId === miniLeagueId),
      leaderboards: fantasyLeaderboards,
    };
  }
  const leagueSnapshot = await adminDb.collection('fantasyMiniLeagues')
    .doc(miniLeagueId)
    .get();
  if (!leagueSnapshot.exists || leagueSnapshot.data()?.visibility !== 'public') return null;
  const league = record<FantasyMiniLeague>(leagueSnapshot.id, leagueSnapshot.data()!);
  const [members, leaderboards] = await Promise.all([
    collection<FantasyMiniLeagueMember>('fantasyMiniLeagueMembers', 'miniLeagueId', miniLeagueId),
    collection<FantasyLeaderboardEntry>('fantasyLeaderboards', 'competitionId', league.competitionId),
  ]);
  return { league, members, leaderboards };
}
