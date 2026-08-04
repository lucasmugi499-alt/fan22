import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { buildSearchTokens, normalizeSearchText } from '../../src/lib/search/searchTokens';

/**
 * Builds the public search index.
 *
 * One document per searchable entity, holding only fields already public on that
 * entity's own page. Rebuilding is idempotent: ids are deterministic, so a rerun updates
 * in place rather than duplicating.
 *
 *   npx tsx --env-file=.env.local scripts/search/build-index.ts --project X --database fg256
 *   ... --apply
 */

type JsonRecord = { id: string; [key: string]: unknown };

type IndexEntry = {
  id: string;
  type: 'athlete' | 'team' | 'league' | 'season';
  entityId: string;
  title: string;
  meta: string;
  href: string;
  searchText: string;
  tokens: string[];
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function valueAfter(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function buildIndexEntries(input: {
  athletes: JsonRecord[];
  teams: JsonRecord[];
  leagues: JsonRecord[];
  seasons: JsonRecord[];
}): IndexEntry[] {
  const entries: IndexEntry[] = [];

  const push = (
    type: IndexEntry['type'],
    record: JsonRecord,
    title: string,
    meta: string,
    href: string,
    extra: Array<string | undefined>,
  ) => {
    if (!title.trim()) return;
    const searchText = [title, ...extra].filter(Boolean).join(' ');
    const tokens = buildSearchTokens(title, ...extra);
    if (!tokens.length) return;
    entries.push({
      id: `${type}_${record.id}`,
      type,
      entityId: record.id,
      title,
      meta,
      href,
      searchText: normalizeSearchText(searchText),
      tokens,
    });
  };

  for (const athlete of input.athletes) {
    push('athlete', athlete,
      text(athlete.name),
      `Athlete / ${text(athlete.position)} / ${text(athlete.city)}`.replace(/\s+\/\s+$/, ''),
      `/athletes/${athlete.id}`,
      [text(athlete.position), text(athlete.city), text(athlete.sport), text(athlete.teamName)]);
  }
  for (const team of input.teams) {
    push('team', team,
      text(team.name),
      `Team / ${text(team.city)} / ${text(team.sport)}`,
      `/teams/${team.id}`,
      [text(team.city), text(team.sport)]);
  }
  for (const league of input.leagues) {
    push('league', league,
      text(league.name),
      `League / ${text(league.city)} / ${text(league.sport)}`,
      `/leagues/${league.id}`,
      [text(league.city), text(league.sport), text(league.season)]);
  }
  for (const season of input.seasons) {
    push('season', season,
      text(season.name),
      `Season / ${text(season.sport)}`,
      `/leagues/${text(season.leagueId)}`,
      [text(season.sport)]);
  }

  return entries;
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const projectId = valueAfter(argv, '--project') ?? process.env.FIREBASE_ADMIN_PROJECT_ID;
  const databaseId = valueAfter(argv, '--database') ?? process.env.GOALPLACE_FIRESTORE_DATABASE_ID ?? 'fg256';

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const app = getApps()[0] ?? initializeApp({
    credential: projectId && clientEmail && privateKey
      ? cert({ projectId, clientEmail, privateKey })
      : applicationDefault(),
    projectId,
  });
  const db = getFirestore(app, databaseId);

  const list = async (name: string) => {
    const snapshot = await db.collection(name).get();
    return snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as JsonRecord));
  };

  const [athletes, teams, leagues, seasons] = await Promise.all([
    list('athletes'), list('teams'), list('leagues'), list('seasons'),
  ]);
  const entries = buildIndexEntries({ athletes, teams, leagues, seasons });

  console.log('GoalPlace256 search index build');
  console.log(`Source: ${projectId}/${databaseId}`);
  console.log(`Mode: ${apply ? 'APPLY (writes)' : 'dry run (no writes)'}`);
  console.log(`Athletes: ${athletes.length}  Teams: ${teams.length}  Leagues: ${leagues.length}  Seasons: ${seasons.length}`);
  console.log(`Index entries: ${entries.length}`);

  if (!apply) {
    console.log('Re-run with --apply to write the index.');
    return;
  }

  for (let offset = 0; offset < entries.length; offset += 400) {
    const batch = db.batch();
    for (const entry of entries.slice(offset, offset + 400)) {
      batch.set(db.collection('searchIndex').doc(entry.id), entry);
    }
    await batch.commit();
  }
  console.log(`Wrote ${entries.length} search index entries.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
