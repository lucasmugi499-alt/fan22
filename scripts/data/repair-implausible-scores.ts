import process from 'node:process';
import { createHash } from 'node:crypto';
import { initializeMigrationFirestore } from '../lib/firestoreTarget';
import { checkScorePlausibility, TYPICAL_TEAM_SCORE } from '../../src/kernel/validators/scorePlausibility';

/**
 * Find completed matches whose score belongs to a different sport, and repair them.
 *
 * ## What went wrong
 *
 * Seven basketball matches on the demo database carried 2-3, 1-1, 3-5, 2-1, 2-2, 2-4 and 1-2.
 * The match, the league and both clubs all said basketball, so the sport tag was right and the
 * scores were football's — left behind by a seed that no longer exists in this repository.
 * They were marked verified, so the product presented them as confirmed official records.
 *
 * ## How a repaired score is chosen
 *
 * Deterministically from the match id, so a rerun produces the same numbers and this script is
 * idempotent, and derived from the original so the CHARACTER of the match survives: a one-point
 * game stays close, a two-point game stays a comfortable win. The margin is scaled by roughly
 * the ratio between the two sports' scoring rates rather than replaced with a random number.
 *
 * A drawn basketball match is the one case where the outcome itself has to change, because
 * basketball does not end level — overtime decides it. Those are reported separately rather
 * than quietly resolved, so nobody has to discover later that a draw became a home win.
 *
 * ## What it will not touch
 *
 * Anything with recorded events, an official result version, or a season. An event stream is
 * the evidence a score was reconstructed from, and overwriting the total while leaving the
 * events would produce a match that disagrees with itself — which is worse than the wrong
 * number. Those are reported for a person to decide.
 *
 *   tsx --env-file=.env.local scripts/data/repair-implausible-scores.ts [--apply]
 */

function deterministic(seed: string, spread: number): number {
  const digest = createHash('sha256').update(seed).digest();
  return digest.readUInt32BE(0) % spread;
}

/** A plausible score for `sport` that keeps the original result and its shape. */
export function repairedScore(
  matchId: string,
  sport: string,
  original: { home: number; away: number },
): { home: number; away: number } {
  /*
   * The TYPICAL band, not the plausible one. The plausible range is generous by design so it
   * never refuses a real rout, and generating from it produced 134-131 basketball games:
   * inside the bounds, and nothing like the platform's actual basketball.
   */
  const range = TYPICAL_TEAM_SCORE[sport.toLowerCase()];
  const loser = range.min + deterministic(matchId, Math.max(1, range.max - range.min));

  const originalMargin = Math.abs(original.home - original.away);
  // A drawn game cannot stay drawn in basketball, so it becomes the narrowest possible win.
  const margin = originalMargin === 0
    ? 1 + deterministic(`${matchId}:margin`, 4)
    : originalMargin * (3 + deterministic(`${matchId}:margin`, 3));

  const homeWon = original.home >= original.away;
  return homeWon
    ? { home: loser + margin, away: loser }
    : { home: loser, away: loser + margin };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const target = initializeMigrationFirestore();
  console.log(`Target: ${target.label} ${apply ? '(APPLYING)' : '(dry run)'}`);

  const [leagues, teams, matches] = await Promise.all([
    target.db.collection('leagues').get(),
    target.db.collection('teams').get(),
    target.db.collection('matches').get(),
  ]);
  const leagueSport = new Map(leagues.docs.map((doc) => [doc.id, String(doc.data().sport ?? '')]));
  const teamSport = new Map(teams.docs.map((doc) => [doc.id, String(doc.data().sport ?? '')]));

  let repaired = 0;
  let drawsResolved = 0;
  const referred: string[] = [];

  for (const doc of matches.docs) {
    const match = doc.data();
    const score = match.score ?? {};
    if (typeof score.home !== 'number' || typeof score.away !== 'number') continue;

    /*
     * The sport is taken from the LEAGUE first. The match's own field is the one most likely
     * to be wrong on a legacy record, and a repair that trusted it would "fix" a score to
     * match a tag that was itself the error.
     */
    const sport = leagueSport.get(String(match.leagueId))
      || teamSport.get(String(match.homeTeamId))
      || String(match.sport ?? '');

    const verdict = checkScorePlausibility(sport, score);
    if (verdict.plausible) continue;

    const hasEvidence = (Array.isArray(match.events) && match.events.length > 0)
      || Boolean(match.officialResultVersion)
      || Boolean(match.seasonId);
    if (hasEvidence) {
      referred.push(`${doc.id}: ${score.home}-${score.away} (${sport}) — has events, an official `
        + 'result version or a season, so it is not this script\'s to overwrite');
      continue;
    }

    const next = repairedScore(doc.id, sport, { home: score.home, away: score.away });
    const wasDraw = score.home === score.away;
    if (wasDraw) drawsResolved += 1;
    console.log(`  ${doc.id.padEnd(14)} ${score.home}-${score.away} -> ${next.home}-${next.away}`
      + `  (${sport}${wasDraw ? ', drawn game resolved to a home win' : ''})`);

    if (apply) {
      await doc.ref.set({
        score: next,
        // The repair is recorded on the document. A score that changed without a trace is the
        // same class of problem as the wrong score.
        scoreRepairedAt: new Date().toISOString(),
        scoreBeforeRepair: { home: score.home, away: score.away },
        scoreRepairReason: verdict.reason,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }
    repaired += 1;
  }

  console.log(`\nImplausible scores repaired : ${repaired}`);
  console.log(`Drawn games resolved        : ${drawsResolved}`);
  console.log(`Referred for a person       : ${referred.length}`);
  for (const line of referred) console.log(`  ${line}`);
  if (!apply) console.log('\nDry run. Re-run with --apply to write.');
}

if (process.argv[1]?.endsWith('repair-implausible-scores.ts')) {
  main().then(() => process.exit(0)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
