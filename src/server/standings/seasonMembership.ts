import type { Firestore } from 'firebase-admin/firestore';
import type { Team } from '../../types';

/**
 * Which clubs competed in a season, as a fact about that season.
 *
 * ## The bug this replaces
 *
 * A season's table was rebuilt from every team currently carrying the league id. That is a
 * question about today, asked of a record about last year. Move a club to another league and it
 * vanishes from the season it actually played; add a new club and it appears in that season's
 * table having played nothing. The table for a completed season is supposed to be a historical
 * fact, and it silently changed shape every time a league's roster of clubs changed.
 *
 * Registration is the fix: a season records who entered it, and the projection reads that
 * rather than asking who is in the league now.
 *
 * ## Why the name is snapshotted
 *
 * `teamName` is written onto every standings row, and a club that rebrands should not
 * retroactively rebrand the table of a season it competed in under its old name. The
 * registration keeps the name as it was; the club document keeps the name as it is.
 *
 * ## The fallback, and why it is loud
 *
 * Seasons that predate this have no registrations, and refusing to build their tables would
 * take down every historical table on the platform to fix a subtler problem. So the projection
 * falls back to current league membership — and says it did, in the return value, so a caller
 * can count how many seasons are still being computed the old way rather than assuming none.
 */

export type SeasonRegistration = {
  id: string;
  seasonId: string;
  leagueId: string;
  teamId: string;
  /** The club's name at registration, so a rebrand does not rewrite an old table. */
  teamName: string;
  registeredAt: string;
  /** Set when a club leaves mid-season. Its played results still count; see below. */
  withdrawnAt?: string;
};

export function seasonRegistrationId(seasonId: string, teamId: string) {
  return `${seasonId}__${teamId}`;
}

export type SeasonMembership = {
  teams: Team[];
  /** True when this came from current league membership because the season has no registrations. */
  fellBackToLeagueMembership: boolean;
};

/**
 * The clubs whose results make up a season's table.
 *
 * A withdrawn club is still included. It played the matches it played, its results are part of
 * the season other clubs competed in, and dropping it from the table would silently change
 * everybody else's points-per-game without changing their points.
 */
export async function readSeasonMembership(
  db: Firestore,
  seasonId: string,
  leagueId: string,
): Promise<SeasonMembership> {
  const registrations = await db.collection('seasonTeams')
    .where('seasonId', '==', seasonId)
    .get();

  if (registrations.empty) {
    const teams = await db.collection('teams').where('leagueId', '==', leagueId).get();
    return {
      teams: teams.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Team)),
      fellBackToLeagueMembership: true,
    };
  }

  /*
   * The club document is still read, for the fields a table shows that a registration does not
   * carry — sport, city, crest. What the registration decides is WHO is in the table and what
   * they were called; a club deleted since is kept, under its registered name, rather than
   * disappearing out of a season it played.
   */
  const rows = registrations.docs.map((doc) => doc.data() as SeasonRegistration);
  const clubs = await Promise.all(
    rows.map((row) => db.collection('teams').doc(row.teamId).get().catch(() => null)),
  );

  return {
    teams: rows.map((row, index) => {
      const club = clubs[index];
      const current = club?.exists ? (club.data() as Partial<Team>) : {};
      return {
        ...current,
        id: row.teamId,
        leagueId: row.leagueId,
        name: row.teamName,
      } as Team;
    }),
    fellBackToLeagueMembership: false,
  };
}

/**
 * Register the clubs a season is being played by.
 *
 * Idempotent on `(seasonId, teamId)`, and it never overwrites an existing registration: the
 * point of the record is that it says what was true when the season began, so a later pass
 * must not quietly restate it with today's club name.
 */
export async function registerSeasonTeams(
  db: Firestore,
  input: { seasonId: string; leagueId: string; teams: Array<{ id: string; name: string }> },
  now: () => Date = () => new Date(),
): Promise<{ registered: number; alreadyRegistered: number }> {
  const registeredAt = now().toISOString();
  let registered = 0;
  let alreadyRegistered = 0;

  for (let index = 0; index < input.teams.length; index += 400) {
    const chunk = input.teams.slice(index, index + 400);
    const existing = await Promise.all(chunk.map((team) => db.collection('seasonTeams')
      .doc(seasonRegistrationId(input.seasonId, team.id)).get()));

    const batch = db.batch();
    chunk.forEach((team, position) => {
      if (existing[position].exists) { alreadyRegistered += 1; return; }
      registered += 1;
      batch.set(db.collection('seasonTeams').doc(seasonRegistrationId(input.seasonId, team.id)), {
        id: seasonRegistrationId(input.seasonId, team.id),
        seasonId: input.seasonId,
        leagueId: input.leagueId,
        teamId: team.id,
        teamName: team.name,
        registeredAt,
      } satisfies SeasonRegistration);
    });
    await batch.commit();
  }

  return { registered, alreadyRegistered };
}
