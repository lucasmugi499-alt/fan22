import process from 'node:process';
import { initializeMigrationFirestore } from '../lib/firestoreTarget';
import { registerSeasonTeams } from '../../src/server/standings/seasonMembership';

/**
 * Give every existing season the club registrations it was played with.
 *
 * A season's table used to be rebuilt from every club currently carrying the league id, which
 * is a question about today asked of a record about last year. `seasonTeams` fixes that going
 * forward — the fixture command registers a club the moment it is committed to a season — but
 * seasons created before it have no registrations and still fall back to league membership,
 * which means they still change shape when a league's clubs change.
 *
 * ## Where the membership comes from
 *
 * The season's own MATCHES, not its league's current club list. A club that played is
 * registered; a club that joined the league afterwards is not, however present it is today.
 * That is the whole point: reconstructing membership from the league would backfill the
 * bug it is meant to remove.
 *
 * Idempotent. A season already registered is left exactly as it is, because the registration
 * records what was true when the season began and a rerun must not restate it with today's
 * club names.
 *
 *   tsx --env-file=.env.local scripts/standings/backfill-season-teams.ts [--apply]
 */
async function main() {
  const apply = process.argv.includes('--apply');
  const target = initializeMigrationFirestore();
  console.log(`Target : ${target.label} ${apply ? '(APPLYING)' : '(dry run)'}`);

  const seasons = await target.db.collection('seasons').get();
  console.log(`Seasons: ${seasons.size}\n`);

  let seasonsRegistered = 0;
  let seasonsSkipped = 0;
  let clubsRegistered = 0;

  for (const season of seasons.docs) {
    const seasonId = season.id;
    const leagueId = String(season.data()?.leagueId ?? '');
    if (!leagueId) {
      console.log(`  ${seasonId.padEnd(34)} skipped: no league`);
      seasonsSkipped += 1;
      continue;
    }

    const existing = await target.db.collection('seasonTeams')
      .where('seasonId', '==', seasonId).limit(1).get();
    if (!existing.empty) {
      console.log(`  ${seasonId.padEnd(34)} already registered`);
      seasonsSkipped += 1;
      continue;
    }

    const matches = await target.db.collection('matches').where('seasonId', '==', seasonId).get();
    const teamIds = [...new Set(matches.docs.flatMap((match) => [
      String(match.data()?.homeTeamId ?? ''),
      String(match.data()?.awayTeamId ?? ''),
    ]).filter(Boolean))];

    if (!teamIds.length) {
      console.log(`  ${seasonId.padEnd(34)} skipped: no fixtures, so nothing played it`);
      seasonsSkipped += 1;
      continue;
    }

    const clubs = await Promise.all(teamIds.map((teamId) =>
      target.db.collection('teams').doc(teamId).get().catch(() => null)));
    const teams = teamIds.map((teamId, index) => ({
      id: teamId,
      // A club deleted since keeps its id as its name rather than blocking the backfill; the
      // table would otherwise lose a competitor because its record was tidied up.
      name: String(clubs[index]?.data()?.name ?? teamId),
    }));

    if (!apply) {
      console.log(`  ${seasonId.padEnd(34)} would register ${teams.length} clubs`);
      seasonsRegistered += 1;
      clubsRegistered += teams.length;
      continue;
    }

    const report = await registerSeasonTeams(target.db, { seasonId, leagueId, teams });
    console.log(`  ${seasonId.padEnd(34)} registered ${report.registered}`
      + (report.alreadyRegistered ? `, ${report.alreadyRegistered} already present` : ''));
    seasonsRegistered += 1;
    clubsRegistered += report.registered;
  }

  console.log(`\nSeasons registered : ${seasonsRegistered}`);
  console.log(`Seasons skipped    : ${seasonsSkipped}`);
  console.log(`Clubs registered   : ${clubsRegistered}`);
  if (!apply) console.log('\nDry run. Re-run with --apply to write.');
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
