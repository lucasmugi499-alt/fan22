import process from 'node:process';
import { readFileSync } from 'node:fs';
import { decideSeedTarget, type SeedDecision } from './seedGuard';
import { resolveDatabaseId, resolveProjectId } from './firestoreTarget';

/**
 * The runtime half of the seed guard: read the arguments, read `.firebaserc`, refuse or report.
 *
 * Kept apart from `seedGuard` so the decision stays a pure function with no filesystem and no
 * `process.exit`, and can be tested exhaustively without credentials.
 */
export function requireSeedTarget(argv: string[] = process.argv): Extract<SeedDecision, { ok: true }> {
  let aliases: Record<string, string> = {};
  try {
    aliases = (JSON.parse(readFileSync('.firebaserc', 'utf8')) as { projects?: Record<string, string> }).projects ?? {};
  } catch {
    aliases = {};
  }

  const confirmIndex = argv.indexOf('--confirm');
  const confirm = argv.find((arg) => arg.startsWith('--confirm='))?.slice('--confirm='.length)
    ?? (confirmIndex >= 0 ? argv[confirmIndex + 1] : undefined);

  const decision = decideSeedTarget({
    projectId: resolveProjectId(argv),
    databaseId: resolveDatabaseId(argv),
    confirm,
    aliases,
  });

  if (!decision.ok) {
    console.error(`Refused: ${decision.reason}`);
    process.exit(1);
  }
  console.log(`Seed target: ${decision.label} (${decision.environment})`);
  return decision;
}
