import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { buildLeagueStandings } from '../../src/lib/leagueModel';
import { adaptMatch } from '../../src/lib/matchRecord';
import type { Match, Team } from '../../src/types';

/**
 * Repairs the stored team aggregates so they stop contradicting the official table.
 *
 * `team.leaguePoints`, `wins`, `draws`, `losses`, `pointsFor` and `pointsAgainst` were
 * seeded independently of any match. Clubs displayed totals like 19 points and records like
 * 3-0-10 in a competition holding four fixtures, beside a league table showing the same
 * clubs on zero.
 *
 * Every surface now reads the standings projection instead, so these fields are no longer
 * authoritative. They are repaired anyway rather than left wrong: anything that reads them
 * later — an export, a report, a migration — would otherwise inherit fiction, and "wrong
 * but unused" is a claim that expires the moment someone uses it.
 *
 * The values written are exactly what `buildLeagueStandings` produces from official results
 * only, through the same `adaptMatch` the application reads with, so the stored copy cannot
 * disagree with the published table.
 *
 *   (no flag)  dry run, prints every change
 *   --apply    write
 */

type Args = { apply: boolean; projectId?: string; databaseId: string };

function parseArgs(argv: string[]): Args {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    apply: argv.includes('--apply'),
    projectId: value('--project') ?? process.env.FIREBASE_ADMIN_PROJECT_ID,
    databaseId: value('--database') ?? process.env.GOALPLACE_FIRESTORE_DATABASE_ID ?? 'fg256',
  };
}

function db(args: Args): Firestore {
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const app = getApps()[0] ?? initializeApp({
    credential: args.projectId && clientEmail && privateKey
      ? cert({ projectId: args.projectId, clientEmail, privateKey })
      : applicationDefault(),
    projectId: args.projectId,
  });
  return getFirestore(app, args.databaseId);
}

const FIELDS = ['leaguePoints', 'wins', 'draws', 'losses', 'pointsFor', 'pointsAgainst'] as const;

export async function runRepair(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const store = db(args);

  const [teamDocs, matchDocs, leagueDocs, seasonDocs] = await Promise.all([
    store.collection('teams').get(),
    store.collection('matches').get(),
    store.collection('leagues').get(),
    store.collection('seasons').get(),
  ]);

  const teams = teamDocs.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Team);
  // Read through the same adapter the app uses, or the stored copy would be computed from
  // a different view of the data than the table it must agree with.
  const matches = matchDocs.docs.map((doc) => adaptMatch({ id: doc.id, ...doc.data() } as Match));
  type SeasonRecord = { id: string; leagueId?: string; status?: string };
  const seasons: SeasonRecord[] = seasonDocs.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }) as SeasonRecord);

  const changes: Array<{ id: string; name: string; before: Record<string, number>; after: Record<string, number> }> = [];

  for (const league of leagueDocs.docs) {
    const leagueTeams = teams.filter((team) => team.leagueId === league.id);
    if (!leagueTeams.length) continue;
    const currentSeasonId = league.data().currentSeasonId;
    const season = seasons.find((candidate) => candidate.id === currentSeasonId)
      ?? seasons.find((candidate) => candidate.leagueId === league.id && candidate.status === 'active');
    const rows = buildLeagueStandings(
      leagueTeams,
      matches.filter((match) => match.leagueId === league.id),
      { seasonId: season?.id },
    );
    for (const row of rows) {
      const team = leagueTeams.find((candidate) => candidate.id === row.teamId)!;
      const after: Record<string, number> = {
        leaguePoints: row.points,
        wins: row.wins,
        draws: row.draws,
        losses: row.losses,
        pointsFor: row.pointsFor,
        pointsAgainst: row.pointsAgainst,
      };
      const before: Record<string, number> = {};
      let differs = false;
      for (const field of FIELDS) {
        const current = Number((team as unknown as Record<string, unknown>)[field] ?? 0);
        before[field] = current;
        if (current !== after[field]) differs = true;
      }
      if (differs) changes.push({ id: team.id, name: team.name, before, after });
    }
  }

  console.log('Team aggregate repair');
  console.log(`Source: ${args.projectId}/${args.databaseId}`);
  console.log(`Mode: ${args.apply ? 'APPLY (writes)' : 'dry run (no writes)'}`);
  console.log(`Teams: ${teams.length}   Leagues: ${leagueDocs.size}   Matches: ${matches.length}`);
  console.log(`Teams needing repair: ${changes.length}`);
  console.log('');

  for (const change of changes.slice(0, 25)) {
    const summary = FIELDS
      .filter((field) => change.before[field] !== change.after[field])
      .map((field) => `${field} ${change.before[field]}->${change.after[field]}`)
      .join(', ');
    console.log(`  ${change.name.padEnd(28)} ${summary}`);
  }
  if (changes.length > 25) console.log(`  … and ${changes.length - 25} more`);

  if (!args.apply) {
    console.log('');
    console.log('Re-run with --apply to write these values.');
    return { changes: changes.length, applied: 0 };
  }

  let applied = 0;
  // Batched, and only the six aggregate fields are touched — nothing else on the team.
  let batch = store.batch();
  for (const change of changes) {
    batch.update(store.collection('teams').doc(change.id), {
      ...change.after,
      // Records where the numbers came from, so a later reader can tell a derived value
      // from a seeded one without diffing against the table.
      aggregatesDerivedFrom: 'official_standings_projection',
      aggregatesDerivedAt: new Date().toISOString(),
    });
    applied += 1;
    if (applied % 400 === 0) {
      await batch.commit();
      batch = store.batch();
    }
  }
  if (applied % 400 !== 0) await batch.commit();
  console.log(`Applied: ${applied}`);
  return { changes: changes.length, applied };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRepair().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
