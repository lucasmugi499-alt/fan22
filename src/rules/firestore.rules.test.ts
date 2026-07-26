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
const RULES_FILE = process.env.FIRESTORE_RULES_FILE ?? 'firestore.rules.next';

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
      rules: readFileSync(RULES_FILE, 'utf8'),
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
    await setDoc(doc(db, `users/${OUTSIDER}`), {
      uid: OUTSIDER,
      email: 'fan@example.com',
      name: 'Fan',
      role: 'fan',
      status: 'active',
      points: 0,
      walletBalance: 0,
      followedAthletes: [],
      followedTeams: [],
      followedLeagues: [],
    });
    await setDoc(doc(db, 'athletes/athlete_001'), {
      userId: OUTSIDER,
      name: 'Demo Athlete',
      bio: 'Original bio',
      city: 'Kampala',
      teamId: 'team_a',
      leagueId: 'league_001',
      verified: true,
      verificationStatus: 'verified',
      totalSupport: 1000,
      supportersCount: 2,
      goalPlacePoints: 10,
      stats: { appearances: 3 },
      impactNeeds: [],
    });
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
  beforeEach(() => seedSubmission());

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

  it('refuses to let a league admin score or verify the match directly', async () => {
    await assertFails(
      updateDoc(doc(asUser(LEAGUE_ADMIN), 'matches/match_001'), {
        score: { home: 2, away: 1 },
        verificationStatus: 'verified',
      })
    );
  });

  it('still lets the league admin maintain fixture details', async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(LEAGUE_ADMIN), 'matches/match_001'), {
        venue: 'Nakivubo Stadium',
        scheduledAt: '2026-03-08T15:00:00.000Z',
      })
    );
  });
});

describe('profile and assignment integrity', () => {
  it('lets a new user create only a fan profile for themselves', async () => {
    const newFan = 'new_fan';
    const profile = {
      uid: newFan,
      email: 'new@example.com',
      name: 'New Fan',
      role: 'fan',
      status: 'active',
      points: 0,
      walletBalance: 0,
      followedAthletes: [],
      followedTeams: [],
      followedLeagues: [],
    };

    await assertSucceeds(setDoc(doc(asUser(newFan), `users/${newFan}`), profile));
    await assertFails(
      setDoc(doc(asUser('new_admin'), 'users/new_admin'), {
        ...profile,
        uid: 'new_admin',
        role: 'league_admin',
      })
    );
  });

  it('lets a user edit profile fields but not role, status, points, or balance', async () => {
    const profileRef = doc(asUser(OUTSIDER), `users/${OUTSIDER}`);

    await assertSucceeds(updateDoc(profileRef, {
      city: 'Jinja',
      followedLeagues: ['league_001'],
    }));

    for (const protectedUpdate of [
      { role: 'league_admin' },
      { status: 'suspended' },
      { points: 9999 },
      { walletBalance: 9999 },
    ]) {
      await assertFails(updateDoc(profileRef, protectedUpdate));
    }
  });

  it('lets an athlete edit their story but not official sporting fields', async () => {
    const athleteRef = doc(asUser(OUTSIDER), 'athletes/athlete_001');

    await assertSucceeds(updateDoc(athleteRef, {
      bio: 'Updated athlete story',
      impactNeeds: ['Training boots'],
    }));

    for (const protectedUpdate of [
      { teamId: 'team_b' },
      { verified: false },
      { verificationStatus: 'pending' },
      { stats: { appearances: 99 } },
      { totalSupport: 9999 },
      { goalPlacePoints: 9999 },
    ]) {
      await assertFails(updateDoc(athleteRef, protectedUpdate));
    }
  });

  it('prevents self-assignment when creating athletes, teams, and leagues', async () => {
    await assertFails(
      setDoc(doc(asUser(OUTSIDER), 'athletes/self_created'), {
        userId: OUTSIDER,
        name: 'Self Created Athlete',
      })
    );
    await assertFails(
      setDoc(doc(asUser(OUTSIDER), 'teams/self_created'), {
        name: 'Self Created Team',
        adminUserIds: [OUTSIDER],
      })
    );
    await assertFails(
      setDoc(doc(asUser(OUTSIDER), 'leagues/self_created'), {
        name: 'Self Created League',
        adminUserIds: [OUTSIDER],
      })
    );
  });

  it('lets assigned admins edit public details but not their authority or official metrics', async () => {
    const teamRef = doc(asUser(TEAM_A_ADMIN), 'teams/team_a');
    const leagueRef = doc(asUser(LEAGUE_ADMIN), 'leagues/league_001');

    await assertSucceeds(updateDoc(teamRef, { description: 'Community team profile' }));
    await assertSucceeds(updateDoc(leagueRef, { description: 'Community competition profile' }));

    await assertFails(updateDoc(teamRef, { adminUserIds: [TEAM_A_ADMIN, OUTSIDER] }));
    await assertFails(updateDoc(teamRef, { leaguePoints: 100 }));
    await assertFails(updateDoc(leagueRef, { adminUserIds: [LEAGUE_ADMIN, OUTSIDER] }));
    await assertFails(updateDoc(leagueRef, { verified: true }));
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
  beforeEach(() => seedSubmission());

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
