import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Proves one field capture canary end to end, against whatever Firestore it is pointed at.
 *
 * The workflow itself is driven by a human with a phone, because that is the thing being
 * tested: a Field Manager on a link, a PIN, a clock and a set of taps. What this does is the
 * part that is hard to do by eye and easy to get wrong, which is checking that every artifact
 * the workflow was supposed to produce exists, that each one appears exactly once, and that
 * replaying the trigger changes nothing.
 *
 * "Exactly once" is the whole point. A canary that only checks the official result exists would
 * pass on a match that had been finalized twice, with two sets of canonical events and a
 * standings row counted double, and that failure is invisible on the surface: the score looks
 * right.
 */

export type CanaryCheck = { name: string; passed: boolean; detail: string };

export type CanaryReport = {
  matchId: string;
  reportId: string | null;
  candidateId: string | null;
  officialResultVersion: number | null;
  officialEventCount: number | null;
  checks: CanaryCheck[];
  passed: boolean;
};

function check(name: string, passed: boolean, detail: string): CanaryCheck {
  return { name, passed, detail };
}

/**
 * Every artifact the field path is supposed to leave behind, and the cardinality of each.
 *
 * Counts rather than existence throughout. The failures worth catching here are duplicates, and
 * a duplicate looks exactly like a success to any check that only asks whether something is
 * there.
 */
export async function verifyCanary(db: Firestore, matchId: string): Promise<CanaryReport> {
  const checks: CanaryCheck[] = [];

  const [matchSnap, reportSnap, ledgerSnap, eventsSnap, statsSnap, provenanceSnap, exceptionsSnap] =
    await Promise.all([
      db.collection('matches').doc(matchId).get(),
      db.collection('matchReports').doc(matchId).get(),
      db.collection('finalizations').where('matchId', '==', matchId).get(),
      db.collection('officialSportEvents').where('matchId', '==', matchId).get(),
      db.collection('officialAthleteMatchStats').where('matchId', '==', matchId).get(),
      db.collection('publicResultProvenance').where('matchId', '==', matchId).get(),
      db.collection('matchOperationalExceptions').where('matchId', '==', matchId).get(),
    ]);

  const match = matchSnap.data() ?? {};
  const report = reportSnap.data() ?? {};
  const ledger = ledgerSnap.docs.map((doc) => doc.data());

  checks.push(check(
    'match is verified',
    match.verificationStatus === 'verified',
    `verificationStatus=${match.verificationStatus ?? 'missing'}`,
  ));

  checks.push(check(
    'report is official',
    report.status === 'official',
    `status=${report.status ?? 'missing'}`,
  ));

  // Exactly one, not at least one.
  checks.push(check(
    'exactly one finalization ledger entry',
    ledger.length === 1,
    `${ledger.length} entries`,
  ));

  const entry = ledger[0] ?? {};
  const provenance = (entry.provenance ?? {}) as {
    workflow?: string;
    source?: { type?: string; recordId?: string; recordVersion?: number };
    principal?: { type?: string; actor?: string };
    finalization?: { candidateId?: string };
  };

  checks.push(check(
    'provenance says field capture under V2',
    provenance.workflow === 'result_engine_v2' && provenance.source?.type === 'field_capture',
    `workflow=${provenance.workflow ?? '?'} source=${provenance.source?.type ?? '?'}`,
  ));

  /**
   * The principal is the whole reason ADR-002 exists. A field capture event attributed to a user
   * would mean a Firebase account was minted for a match worker, which is the design this
   * architecture was built to avoid.
   */
  checks.push(check(
    'principal is a match ops session',
    provenance.principal?.type === 'match_ops_session',
    `principal=${provenance.principal?.type ?? '?'}`,
  ));

  checks.push(check(
    'data quality is computed, not absent',
    typeof (entry.dataQuality as { tier?: string })?.tier === 'string',
    `tier=${(entry.dataQuality as { tier?: string })?.tier ?? 'missing'}`,
  ));

  checks.push(check(
    'canonical events exist',
    eventsSnap.size > 0,
    `${eventsSnap.size} official events`,
  ));

  // One official event id written twice would mean the emission ran twice.
  const eventIds = eventsSnap.docs.map((doc) => doc.id);
  checks.push(check(
    'no duplicate official events',
    new Set(eventIds).size === eventIds.length,
    `${eventIds.length} events, ${new Set(eventIds).size} distinct`,
  ));

  const versions = new Set(eventsSnap.docs.map((doc) => doc.data().officialResultVersion));
  checks.push(check(
    'events belong to one result version',
    versions.size <= 1,
    `versions=${[...versions].join(',') || 'none'}`,
  ));

  const statAthletes = statsSnap.docs.map((doc) => doc.data().athleteId);
  checks.push(check(
    'one athlete projection per athlete',
    new Set(statAthletes).size === statAthletes.length,
    `${statAthletes.length} rows, ${new Set(statAthletes).size} distinct athletes`,
  ));

  checks.push(check(
    'public provenance published',
    provenanceSnap.size === 1,
    `${provenanceSnap.size} provenance records`,
  ));

  const blocking = exceptionsSnap.docs
    .map((doc) => doc.data())
    .filter((row) => row.blocking && row.status === 'open');
  checks.push(check(
    'no open blocking exception',
    blocking.length === 0,
    blocking.length ? blocking.map((row) => row.code).join(', ') : 'none',
  ));

  return {
    matchId,
    reportId: reportSnap.exists ? reportSnap.id : null,
    candidateId: provenance.finalization?.candidateId ?? null,
    officialResultVersion: typeof match.officialResultVersion === 'number' ? match.officialResultVersion : null,
    officialEventCount: eventsSnap.size,
    checks,
    passed: checks.every((entry) => entry.passed),
  };
}

/**
 * Confirms a replay changed nothing.
 *
 * Compared by counting rather than by trusting the finalizer's return value: the question is
 * whether the DATABASE changed, and a function reporting "skipped" while having written
 * something is precisely the bug worth catching.
 */
export function compareSnapshots(before: CanaryReport, after: CanaryReport): CanaryCheck[] {
  return [
    check(
      'replay produced no second result version',
      before.officialResultVersion === after.officialResultVersion,
      `${before.officialResultVersion} -> ${after.officialResultVersion}`,
    ),
    check(
      'replay produced no extra official events',
      before.officialEventCount === after.officialEventCount,
      `${before.officialEventCount} -> ${after.officialEventCount}`,
    ),
    check(
      'replay produced no second candidate',
      before.candidateId === after.candidateId,
      `${before.candidateId} -> ${after.candidateId}`,
    ),
  ];
}

/** A deliberately bad report must produce a reviewable case and zero official writes. */
export async function verifyBadReport(db: Firestore, matchId: string): Promise<CanaryReport> {
  const [ledgerSnap, eventsSnap, exceptionsSnap, matchSnap] = await Promise.all([
    db.collection('finalizations').where('matchId', '==', matchId).get(),
    db.collection('officialSportEvents').where('matchId', '==', matchId).get(),
    db.collection('matchOperationalExceptions').where('matchId', '==', matchId).get(),
    db.collection('matches').doc(matchId).get(),
  ]);

  const checks = [
    check('no official result was written', ledgerSnap.empty, `${ledgerSnap.size} ledger entries`),
    check('no canonical events were written', eventsSnap.empty, `${eventsSnap.size} events`),
    check(
      'match was not marked verified',
      matchSnap.data()?.verificationStatus !== 'verified',
      `verificationStatus=${matchSnap.data()?.verificationStatus ?? 'missing'}`,
    ),
    check(
      'a reviewable case was opened',
      exceptionsSnap.docs.some((doc) => doc.data().blocking),
      exceptionsSnap.docs.map((doc) => doc.data().code).join(', ') || 'none',
    ),
  ];

  return {
    matchId,
    reportId: matchId,
    candidateId: null,
    officialResultVersion: null,
    officialEventCount: eventsSnap.size,
    checks,
    passed: checks.every((entry) => entry.passed),
  };
}

function initialize() {
  if (getApps().length) return getFirestore();
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  initializeApp(raw ? { credential: cert(JSON.parse(raw)) } : { credential: applicationDefault() });
  return getFirestore();
}

function render(title: string, report: CanaryReport) {
  console.log(`\n${title}`);
  for (const entry of report.checks) {
    console.log(`  ${entry.passed ? 'PASS' : 'FAIL'}  ${entry.name}  (${entry.detail})`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const matchId = args[args.indexOf('--match') + 1];
  const badMatchId = args.includes('--bad-match') ? args[args.indexOf('--bad-match') + 1] : null;

  if (!args.includes('--match') || !matchId?.trim()) {
    console.error('Usage: --match <matchId> [--bad-match <matchId>]');
    console.error('Drive the Field Manager workflow first; this verifies what it produced.');
    process.exitCode = 1;
    return;
  }

  const db = initialize();
  const report = await verifyCanary(db, matchId);
  render(`Field capture canary: ${matchId}`, report);

  console.log('\nEvidence fields:');
  console.log(`  matchId                 ${report.matchId}`);
  console.log(`  reportId                ${report.reportId ?? 'missing'}`);
  console.log(`  candidateId             ${report.candidateId ?? 'missing'}`);
  console.log(`  officialResultVersion   ${report.officialResultVersion ?? 'missing'}`);
  console.log(`  officialEventCount      ${report.officialEventCount ?? 'missing'}`);

  let allPassed = report.passed;

  if (badMatchId) {
    const bad = await verifyBadReport(db, badMatchId);
    render(`Bad report: ${badMatchId}`, bad);
    allPassed = allPassed && bad.passed;
  } else {
    console.log('\nNo --bad-match supplied. The canary is incomplete without one: a path that');
    console.log('only ever succeeds has not been shown to refuse anything.');
    allPassed = false;
  }

  console.log(`\nCanary: ${allPassed ? 'PASSED' : 'FAILED'}`);
  console.log('Replay the trigger, re-run this, and confirm every count is identical.');
  process.exitCode = allPassed ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
