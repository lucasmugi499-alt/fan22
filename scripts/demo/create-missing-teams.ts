import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Brings each small demo league up to the eight clubs it advertises.
 *
 * `league_001`..`league_010` each declare `teamsCount: 8` and hold four team documents, so
 * the league header advertised eight while the table could only ever render four. The
 * clubs were never created; nothing was filtering them out.
 *
 * Every team created here is a complete record — the same shape the existing clubs carry,
 * plus a `demoData` marker and a `shortName` — so it is eligible for standings, discovery
 * and search on the same terms as any other club. It is NOT given results: fabricating
 * played matches to make a new club look active would put invented sporting history into a
 * platform whose entire claim is that its records are earned.
 *
 * So a new club appears in the table on zero, played zero, which is exactly true.
 *
 * The search projection is left to the deployed `onTeamWrittenIndexSearch` trigger rather
 * than written here: one projector, already canonical, already tested.
 *
 *   (no flag)  dry run
 *   --apply    create
 */

const SUFFIXES = ['Rangers', 'Stars', 'Rovers', 'Athletic'] as const;
const TARGET_TEAMS = 8;

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

/**
 * A short name has to be unique inside its league or it identifies nothing. Initials alone
 * are not: "Gulu Rangers" and "Gulu Rovers" both reduce to GR. The club word is extended a
 * letter at a time until the abbreviation is distinct among the names already taken.
 */
function shortNameFor(name: string, taken: Set<string>) {
  const words = name.split(/\s+/).filter(Boolean);
  const prefix = words.length === 1 ? '' : words.slice(0, -1).map((word) => word[0]).join('');
  const last = words[words.length - 1] ?? name;
  for (let length = 1; length <= last.length; length += 1) {
    const candidate = `${prefix}${last.slice(0, length)}`.toUpperCase();
    if (!taken.has(candidate)) return candidate;
  }
  return `${prefix}${last}`.toUpperCase();
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export async function runCreateMissingTeams(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const store = db(args);
  const now = new Date().toISOString();

  const leagues = (await store.collection('leagues').get()).docs
    .filter((league) => /^league_0\d{2}$/.test(league.id));
  const allTeams = (await store.collection('teams').get()).docs;

  const planned: Array<{ id: string; data: Record<string, unknown> }> = [];
  const countUpdates: Array<{ leagueId: string; from: number; to: number }> = [];

  for (const league of leagues) {
    const leagueData = league.data();
    const existing = allTeams.filter((team) => team.data().leagueId === league.id);
    const existingNames = new Set(existing.map((team) => String(team.data().name)));
    const takenShortNames = new Set(
      existing.map((team) => String(team.data().shortName ?? '')).filter(Boolean),
    );
    const missing = Math.max(0, TARGET_TEAMS - existing.length);

    for (let index = 0; index < missing; index += 1) {
      const suffix = SUFFIXES[index % SUFFIXES.length];
      const name = `${leagueData.city} ${suffix}`;
      if (existingNames.has(name)) continue;
      existingNames.add(name);
      // Stable and descriptive: derived from the league and the club, so a re-run produces
      // the same id and cannot create a duplicate.
      const id = `team_${league.id.replace('league_', '')}_${slug(suffix)}`;
      const shortName = shortNameFor(name, takenShortNames);
      takenShortNames.add(shortName);
      planned.push({
        id,
        data: {
          id,
          name,
          shortName,
          sport: leagueData.sport,
          leagueId: league.id,
          city: leagueData.city,
          location: leagueData.city,
          country: 'Uganda',
          description: `A community ${leagueData.sport} club from ${leagueData.city}.`,
          plan: 'free',
          verified: false,
          verificationStatus: 'pending',
          adminUserIds: [],
          supportersCount: 0,
          totalSupport: 0,
          // Standings eligibility comes from leagueId; these are the aggregate fields every
          // club carries, seeded at the only honest value for a club that has not played.
          wins: 0,
          draws: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          leaguePoints: 0,
          aggregatesDerivedFrom: 'official_standings_projection',
          aggregatesDerivedAt: now,
          demoData: true,
          createdAt: now,
        },
      });
    }

    const finalCount = existing.length + missing;
    if (Number(leagueData.teamsCount ?? 0) !== finalCount) {
      countUpdates.push({ leagueId: league.id, from: Number(leagueData.teamsCount ?? 0), to: finalCount });
    }
  }

  console.log('Create missing demo teams');
  console.log(`Source: ${args.projectId}/${args.databaseId}`);
  console.log(`Mode: ${args.apply ? 'APPLY (writes)' : 'dry run'}`);
  console.log(`Leagues in scope: ${leagues.length}`);
  console.log(`Teams to create: ${planned.length}`);
  for (const team of planned.slice(0, 12)) {
    console.log(`  ${team.id.padEnd(28)} ${team.data.name} (${team.data.shortName}) ${team.data.sport}`);
  }
  if (planned.length > 12) console.log(`  … and ${planned.length - 12} more`);
  console.log(`teamsCount corrections: ${countUpdates.length}`);
  for (const update of countUpdates) console.log(`  ${update.leagueId}: ${update.from} -> ${update.to}`);

  if (!args.apply) {
    console.log('');
    console.log('Re-run with --apply to create.');
    return { created: 0, planned: planned.length };
  }

  let created = 0;
  for (const team of planned) {
    // create() rather than set(): a colliding id must fail loudly, not overwrite a club.
    await store.collection('teams').doc(team.id).create(team.data).catch((error) => {
      console.log(`  SKIP ${team.id}: ${error instanceof Error ? error.message : error}`);
      created -= 1;
    });
    created += 1;
  }
  for (const update of countUpdates) {
    await store.collection('leagues').doc(update.leagueId).update({
      teamsCount: update.to,
      teamsCountDerivedAt: now,
    });
  }
  console.log(`Created: ${created}`);
  console.log(`teamsCount updated: ${countUpdates.length}`);
  console.log('Search projection is written by the deployed onTeamWrittenIndexSearch trigger.');
  return { created, planned: planned.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCreateMissingTeams().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
