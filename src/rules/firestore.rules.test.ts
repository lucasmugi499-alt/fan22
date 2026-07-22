import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

/**
 * Security rules tests for `firestore.rules.next` — the pending authorization matrix
 * covering seasons and result submissions. It is NOT the deployed ruleset: it was rolled
 * back from production on 2026-07-22 because it had compiled but never been behaviourally
 * verified (see docs/INCIDENT-2026-07-22-rules-deploy.md).
 *
 * These run against the Firestore emulator, so they need Java:
 *
 *   brew install --cask temurin      (or any JDK 11+)
 *   npm run test:rules
 *
 * They are a separate script from `npm test` deliberately — the unit suite must stay fast
 * and runnable without a JVM.
 *
 * What is being pinned here is the trust boundary: team admins report results, league
 * admins resolve exceptions, and NOBODY with a client credential can author an official
 * sporting record.
 */

const PROJECT_ID = 'goalplace256-rules-test';

let testEnv: RulesTestEnvironment;

const TEAM_A_ADMIN = 'user_team_a';
const TEAM_B_ADMIN = 'user_team_b';
const LEAGUE_ADMIN = 'user_league';
const OUTSIDER = 'user_outsider';

function submissionDoc(overrides: Record<string, unknown> = {}) {
  return {
    matchId: 'match_001',
    leagueId: 'league_001',
    seasonId: 'season_001',
    submittedByTeamId: 'team_a',
    opponentTeamId: 'team_b',
    submittedByUserId: TEAM_A_ADMIN,
    homeScore: 2,
    awayScore: 1,
    scorers: [],
    evidenceRefs: [],
    status: 'pending_confirmation',
    revision: 1,
    resultVersion: 1,
    submittedAsFinal: true,
    confirmationDeadline: '2026-03-04T00:00:00.000Z',
    submittedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      // Deliberately NOT firestore.rules. That file mirrors what is live in
      // production (the known-good baseline). The new authorization matrix lives in
      // firestore.rules.next until this suite passes against it in staging — so an
      // accidental `firebase deploy` can only ever redeploy the validated baseline.
      rules: readFileSync('firestore.rules.next', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Parent documents the rules read via get(): team and league admin lists.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'teams/team_a'), { name: 'Team A', adminUserIds: [TEAM_A_ADMIN] });
    await setDoc(doc(db, 'teams/team_b'), { name: 'Team B', adminUserIds: [TEAM_B_ADMIN] });
    await setDoc(doc(db, 'leagues/league_001'), { name: 'League', adminUserIds: [LEAGUE_ADMIN] });
    await setDoc(doc(db, 'matches/match_001'), {
      leagueId: 'league_001',
      seasonId: 'season_001',
      status: 'completed',
      verificationStatus: 'pending',
    });
  });
});

function asUser(uid: string) {
  return testEnv.authenticatedContext(uid).firestore();
}

async function seedSubmission(overrides: Record<string, unknown> = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'resultSubmissions/match_001'), submissionDoc(overrides));
  });
}

describe('result submission: creating a claim', () => {
  it('lets the submitting team open a claim', async () => {
    await assertSucceeds(
      setDoc(doc(asUser(TEAM_A_ADMIN), 'resultSubmissions/match_001'), submissionDoc())
    );
  });

  it('refuses a claim from someone who runs neither team', async () => {
    await assertFails(
      setDoc(doc(asUser(OUTSIDER), 'resultSubmissions/match_001'), submissionDoc({
        submittedByUserId: OUTSIDER,
      }))
    );
  });

  it('refuses a claim whose document id is not the matchId', async () => {
    // This is what makes one-active-submission-per-match atomic.
    await assertFails(
      setDoc(doc(asUser(TEAM_A_ADMIN), 'resultSubmissions/something_else'), submissionDoc())
    );
  });

  it('refuses a submission not explicitly marked final', async () => {
    await assertFails(
      setDoc(doc(asUser(TEAM_A_ADMIN), 'resultSubmissions/match_001'), submissionDoc({
        submittedAsFinal: false,
      }))
    );
  });

  it('refuses a claim that starts anywhere but pending_confirmation', async () => {
    for (const status of ['confirmed', 'official', 'disputed']) {
      await assertFails(
        setDoc(doc(asUser(TEAM_A_ADMIN), 'resultSubmissions/match_001'), submissionDoc({ status }))
      );
    }
  });

  it('refuses a claim against a team the submitter also runs', async () => {
    await assertFails(
      setDoc(doc(asUser(TEAM_A_ADMIN), 'resultSubmissions/match_001'), submissionDoc({
        opponentTeamId: 'team_a',
      }))
    );
  });
});

describe('result submission: answering a claim', () => {
  beforeEach(seedSubmission);

  it('lets the opponent confirm', async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(TEAM_B_ADMIN), 'resultSubmissions/match_001'), {
        status: 'confirmed',
        respondedByUserId: TEAM_B_ADMIN,
        respondedAt: '2026-03-02T00:00:00.000Z',
      })
    );
  });

  it('lets the opponent dispute', async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(TEAM_B_ADMIN), 'resultSubmissions/match_001'), {
        status: 'disputed',
        respondedByUserId: TEAM_B_ADMIN,
        disputeReason: 'Second goal was offside.',
      })
    );
  });

  it('refuses to let the submitting team confirm its own claim', async () => {
    await assertFails(
      updateDoc(doc(asUser(TEAM_A_ADMIN), 'resultSubmissions/match_001'), {
        status: 'confirmed',
        respondedByUserId: TEAM_A_ADMIN,
      })
    );
  });

  it('refuses to let the opponent rewrite the claimed score', async () => {
    await assertFails(
      updateDoc(doc(asUser(TEAM_B_ADMIN), 'resultSubmissions/match_001'), {
        status: 'confirmed',
        respondedByUserId: TEAM_B_ADMIN,
        homeScore: 9,
      })
    );
  });

  it('lets the submitter withdraw an unanswered claim', async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(TEAM_A_ADMIN), 'resultSubmissions/match_001'), {
        status: 'withdrawn',
        resolvedAt: '2026-03-01T01:00:00.000Z',
      })
    );
  });

  it('refuses a response from an unrelated user', async () => {
    await assertFails(
      updateDoc(doc(asUser(OUTSIDER), 'resultSubmissions/match_001'), { status: 'confirmed' })
    );
  });
});

describe('the trust boundary: nobody can author an official result', () => {
  it('refuses status official from every client role, from every state', async () => {
    for (const from of ['pending_confirmation', 'confirmed', 'disputed', 'confirmation_overdue']) {
      await seedSubmission({ status: from });
      for (const uid of [TEAM_A_ADMIN, TEAM_B_ADMIN, LEAGUE_ADMIN, OUTSIDER]) {
        await assertFails(
          updateDoc(doc(asUser(uid), 'resultSubmissions/match_001'), { status: 'official' })
        );
      }
    }
  });

  it('refuses status superseded from every client role', async () => {
    await seedSubmission({ status: 'official' });
    for (const uid of [TEAM_A_ADMIN, TEAM_B_ADMIN, LEAGUE_ADMIN]) {
      await assertFails(
        updateDoc(doc(asUser(uid), 'resultSubmissions/match_001'), { status: 'superseded' })
      );
    }
  });

  it('refuses to let a team admin write the match record directly', async () => {
    await assertFails(
      updateDoc(doc(asUser(TEAM_A_ADMIN), 'matches/match_001'), {
        verificationStatus: 'verified',
      })
    );
  });
});

describe('league adjudication', () => {
  it('lets the league resolve a dispute with a corrected score', async () => {
    await seedSubmission({ status: 'disputed' });
    await assertSucceeds(
      updateDoc(doc(asUser(LEAGUE_ADMIN), 'resultSubmissions/match_001'), {
        status: 'confirmed',
        resolution: 'league_corrected',
        resolvedByUserId: LEAGUE_ADMIN,
        correctedHomeScore: 1,
        correctedAwayScore: 1,
      })
    );
  });

  it('refuses to let the league rewrite the original claim', async () => {
    await seedSubmission({ status: 'disputed' });
    await assertFails(
      updateDoc(doc(asUser(LEAGUE_ADMIN), 'resultSubmissions/match_001'), {
        status: 'confirmed',
        homeScore: 5,
      })
    );
  });

  it('lets the league extend a lapsed confirmation window', async () => {
    await seedSubmission({ status: 'confirmation_overdue' });
    await assertSucceeds(
      updateDoc(doc(asUser(LEAGUE_ADMIN), 'resultSubmissions/match_001'), {
        status: 'pending_confirmation',
        confirmationDeadline: '2026-03-07T00:00:00.000Z',
      })
    );
  });

  it("refuses adjudication from another league's admin", async () => {
    await seedSubmission({ status: 'disputed' });
    await assertFails(
      updateDoc(doc(asUser(OUTSIDER), 'resultSubmissions/match_001'), { status: 'confirmed' })
    );
  });
});

describe('audit trail is append-only', () => {
  beforeEach(seedSubmission);

  it('allows appending an event', async () => {
    await assertSucceeds(
      setDoc(doc(asUser(TEAM_B_ADMIN), 'resultSubmissions/match_001/events/e1'), {
        submissionId: 'match_001',
        from: 'pending_confirmation',
        to: 'confirmed',
        actor: 'opponent_team',
        actorUserId: TEAM_B_ADMIN,
        createdAt: '2026-03-02T00:00:00.000Z',
      })
    );
  });

  it('refuses to let anyone edit history', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'resultSubmissions/match_001/events/e1'), {
        submissionId: 'match_001',
        to: 'confirmed',
        actor: 'opponent_team',
        actorUserId: TEAM_B_ADMIN,
        createdAt: '2026-03-02T00:00:00.000Z',
      });
    });

    for (const uid of [TEAM_A_ADMIN, TEAM_B_ADMIN, LEAGUE_ADMIN]) {
      await assertFails(
        updateDoc(doc(asUser(uid), 'resultSubmissions/match_001/events/e1'), { to: 'rejected' })
      );
    }
  });
});

describe('seasons', () => {
  it('are publicly readable', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'seasons/season_001'), {
        leagueId: 'league_001',
        name: '2026 Season',
      });
    });
    await assertSucceeds(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'seasons/season_001')));
  });

  it('are writable only by the owning league', async () => {
    await assertSucceeds(
      setDoc(doc(asUser(LEAGUE_ADMIN), 'seasons/season_new'), {
        leagueId: 'league_001',
        name: '2027 Season',
      })
    );
    await assertFails(
      setDoc(doc(asUser(TEAM_A_ADMIN), 'seasons/season_other'), {
        leagueId: 'league_001',
        name: 'Not allowed',
      })
    );
  });
});
