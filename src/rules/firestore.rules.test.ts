import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

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

// Principals used only by the canonical-authority matrix below.
const REVOKED_ADMIN = 'user_revoked';
const SUSPENDED_ADMIN = 'user_suspended';
const EXPIRED_ADMIN = 'user_expired';
const LEGACY_ONLY_ADMIN = 'user_legacy_only';
const RESULTS_ONLY = 'user_results_only';

const TEAM_CAPABILITIES = [
  'team.profile.manage',
  'team.staff.invite',
  'team.roster.manage',
  'team.athlete.create',
  'team.athlete.invite',
  'team.result.submit',
  'team.result.confirm',
  'team.update.publish',
];

const LEAGUE_CAPABILITIES = [
  'league.profile.manage',
  'league.season.manage',
  'league.team.create',
  'league.team_admin.invite',
  'league.roster.verify',
  'league.result.resolve',
  'league.notice.publish',
];

/**
 * Mirrors what the server-side projector writes. Rules authorize from this document and
 * nothing else, so a scope with no document here is denied outright.
 */
function accessIndexDoc(
  userId: string,
  scopeType: 'league' | 'team' | 'athlete',
  scopeId: string,
  capabilities: string[],
) {
  return {
    userId,
    scopeType,
    scopeId,
    activeRoles: ['team_admin'],
    capabilities,
    assignmentIds: [`assignment_${scopeType}_${scopeId}_${userId}`],
    accessVersion: 1,
    updatedAt: '2026-03-01T00:00:00.000Z',
  };
}

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

    // Canonical grants. LEGACY_ONLY_ADMIN is deliberately present in the adminUserIds
    // array above but has no accessIndex document: after the cutover the array grants
    // nothing.
    await setDoc(doc(db, 'teams/team_a'), {
      name: 'Team A',
      adminUserIds: [TEAM_A_ADMIN, LEGACY_ONLY_ADMIN, REVOKED_ADMIN, SUSPENDED_ADMIN, EXPIRED_ADMIN],
    });
    await setDoc(
      doc(db, `accessIndex/team_team_a_${TEAM_A_ADMIN}`),
      accessIndexDoc(TEAM_A_ADMIN, 'team', 'team_a', TEAM_CAPABILITIES),
    );
    await setDoc(
      doc(db, `accessIndex/team_team_b_${TEAM_B_ADMIN}`),
      accessIndexDoc(TEAM_B_ADMIN, 'team', 'team_b', TEAM_CAPABILITIES),
    );
    await setDoc(
      doc(db, `accessIndex/league_league_001_${LEAGUE_ADMIN}`),
      accessIndexDoc(LEAGUE_ADMIN, 'league', 'league_001', LEAGUE_CAPABILITIES),
    );
    // A narrower bundle: may report results, may not edit the team profile.
    await setDoc(
      doc(db, `accessIndex/team_team_a_${RESULTS_ONLY}`),
      accessIndexDoc(RESULTS_ONLY, 'team', 'team_a', ['team.result.submit', 'team.result.confirm']),
    );
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
      homeTeamId: 'team_a',
      awayTeamId: 'team_b',
      status: 'completed',
      verificationStatus: 'pending',
    });
  });
});

function asUser(uid: string) {
  return testEnv.authenticatedContext(uid).firestore();
}

function asUserWithClaims(uid: string, claims: Record<string, unknown>) {
  return testEnv.authenticatedContext(uid, claims).firestore();
}

async function seedSubmission(overrides: Record<string, unknown> = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'resultSubmissions/match_001'), submissionDoc(overrides));
  });
}

describe('result submission: creating a claim', () => {
  it('lets an involved team check that no claim exists yet', async () => {
    await assertSucceeds(
      getDoc(doc(asUser(TEAM_A_ADMIN), 'resultSubmissions/match_001'))
    );
  });

  it('lets the submitting team open a claim', async () => {
    await assertSucceeds(
      setDoc(doc(asUser(TEAM_A_ADMIN), 'resultSubmissions/match_001'), submissionDoc())
    );
  });

  it('refuses a submission large enough to break the finalizer', async () => {
    /**
     * C6. The finalizer expands these lists into squad, scoring and stat events inside one
     * transaction. An unbounded list is an unbounded write plan; a plan past Firestore's
     * operation budget fails, the trigger retries, and one document becomes a permanently
     * retrying function with the match stuck out of official state.
     *
     * Refusing the write is the cheapest place to stop that — before the document exists.
     */
    for (const oversized of [
      { scorers: Array.from({ length: 61 }, () => ({ athleteId: 'athlete_a_1', count: 1 })) },
      { athleteStatLines: Array.from({ length: 121 }, () => ({ athleteId: 'athlete_a_1' })) },
      { evidenceRefs: Array.from({ length: 21 }, (_, i) => `uploads/e${i}.jpg`) },
      { activeSquads: { team_a: ['x'], team_b: ['y'], team_ghost: ['z'] } },
      { homeScore: 9999 },
    ]) {
      await assertFails(
        setDoc(doc(asUser(TEAM_A_ADMIN), 'resultSubmissions/match_001'), submissionDoc(oversized))
      );
    }
  });

  it('still accepts a realistic fixture at the caps', async () => {
    // The caps must stop amplification without refereeing real team sheets.
    await assertSucceeds(
      setDoc(doc(asUser(TEAM_A_ADMIN), 'resultSubmissions/match_001'), submissionDoc({
        scorers: Array.from({ length: 12 }, () => ({ athleteId: 'athlete_a_1', count: 1 })),
        evidenceRefs: ['uploads/teamsheet.jpg'],
        homeScore: 128,
        awayScore: 119,
      }))
    );
  });

  it('lets the submitting team include active squads and athlete stat lines', async () => {
    await assertSucceeds(
      setDoc(doc(asUser(TEAM_A_ADMIN), 'resultSubmissions/match_001'), submissionDoc({
        activeSquads: {
          team_a: ['athlete_a_1'],
          team_b: ['athlete_b_1'],
        },
        athleteStatLines: [
          {
            athleteId: 'athlete_a_1',
            teamId: 'team_a',
            minutesPlayed: 64,
            stats: {
              assist: 1,
              yellow_card: 1,
            },
          },
        ],
      }))
    );
  });

  it('refuses malformed athlete stat lines', async () => {
    await assertFails(
      setDoc(doc(asUser(TEAM_A_ADMIN), 'resultSubmissions/match_001'), submissionDoc({
        athleteStatLines: {
          athlete_a_1: {
            assist: 1,
          },
        },
      }))
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

  it('refuses a result claim before the fixture has been played', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'matches/match_001'), {
        status: 'scheduled',
      });
    });
    await assertFails(
      setDoc(doc(asUser(TEAM_A_ADMIN), 'resultSubmissions/match_001'), submissionDoc())
    );
  });

  it('refuses a claim for an already-official fixture', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'matches/match_001'), {
        verificationStatus: 'verified',
        officialResultVersion: 1,
      });
    });
    await assertFails(
      setDoc(doc(asUser(TEAM_A_ADMIN), 'resultSubmissions/match_001'), submissionDoc())
    );
  });

  it('refuses fractional scores', async () => {
    await assertFails(
      setDoc(
        doc(asUser(TEAM_A_ADMIN), 'resultSubmissions/match_001'),
        submissionDoc({ homeScore: 1.5 })
      )
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

  it('refuses a claim whose teams do not match the fixture', async () => {
    await assertFails(
      setDoc(
        doc(asUser(TEAM_A_ADMIN), 'resultSubmissions/match_001'),
        submissionDoc({ opponentTeamId: 'team_z' })
      )
    );
  });

  it('atomically creates the claim and its first audit event', async () => {
    const db = asUser(TEAM_A_ADMIN);
    const batch = writeBatch(db);
    batch.set(doc(db, 'resultSubmissions/match_001'), submissionDoc());
    batch.set(doc(db, 'resultSubmissions/match_001/events/event_001'), {
      submissionId: 'match_001',
      from: null,
      to: 'pending_confirmation',
      actor: 'submitting_team',
      actorUserId: TEAM_A_ADMIN,
      createdAt: '2026-03-01T00:00:00.000Z',
    });
    await assertSucceeds(batch.commit());
  });

  it('replaces a rejected claim at the next revision with a matching event', async () => {
    await seedSubmission({ status: 'rejected' });
    const db = asUser(TEAM_A_ADMIN);
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'resultSubmissions/match_001'),
      submissionDoc({ revision: 2 })
    );
    batch.set(doc(db, 'resultSubmissions/match_001/events/replacement'), {
      submissionId: 'match_001',
      from: 'rejected',
      to: 'pending_confirmation',
      actor: 'submitting_team',
      actorUserId: TEAM_A_ADMIN,
      createdAt: '2026-03-03T00:00:00.000Z',
    });
    await assertSucceeds(batch.commit());
  });
});

describe('result submission: answering a claim', () => {
  beforeEach(() => seedSubmission());

  it('lets the opponent confirm', async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(TEAM_B_ADMIN), 'resultSubmissions/match_001'), {
        status: 'confirmed',
        resolution: 'opponent_confirmed',
        respondedByUserId: TEAM_B_ADMIN,
        respondedAt: '2026-03-02T00:00:00.000Z',
      })
    );
  });

  it('refuses opponent confirmation with false provenance', async () => {
    await assertFails(
      updateDoc(doc(asUser(TEAM_B_ADMIN), 'resultSubmissions/match_001'), {
        status: 'confirmed',
        resolution: 'league_upheld',
        respondedByUserId: TEAM_B_ADMIN,
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

describe('result submission queues', () => {
  beforeEach(() => seedSubmission());

  it('lets the opponent query its confirmation inbox', async () => {
    const db = asUser(TEAM_B_ADMIN);
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'resultSubmissions'),
          where('opponentTeamId', '==', 'team_b')
        )
      )
    );
  });

  it('lets the owning league query its exception queue', async () => {
    const db = asUser(LEAGUE_ADMIN);
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'resultSubmissions'),
          where('leagueId', '==', 'league_001')
        )
      )
    );
  });

  it('refuses the same queues to an unrelated user', async () => {
    const db = asUser(OUTSIDER);
    await assertFails(
      getDocs(
        query(
          collection(db, 'resultSubmissions'),
          where('opponentTeamId', '==', 'team_b')
        )
      )
    );
    await assertFails(
      getDocs(
        query(
          collection(db, 'resultSubmissions'),
          where('leagueId', '==', 'league_001')
        )
      )
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

  it('refuses browser fixture creation even from a league admin', async () => {
    await assertFails(
      setDoc(doc(asUser(LEAGUE_ADMIN), 'matches/match_new'), {
        leagueId: 'league_001',
        seasonId: 'season_001',
        homeTeamId: 'team_a',
        awayTeamId: 'team_b',
        status: 'scheduled',
        verificationStatus: 'pending',
        score: { home: null, away: null },
      })
    );
  });

  it('refuses browser fixture edits even from a league admin', async () => {
    await assertFails(
      updateDoc(doc(asUser(LEAGUE_ADMIN), 'matches/match_001'), {
        venue: 'Nakivubo Stadium',
        scheduledAt: '2026-03-08T15:00:00.000Z',
      })
    );
  });
});

describe('profile and assignment integrity', () => {
  it('lets a new user create only a fan or invited pending profile for themselves', async () => {
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
    await assertSucceeds(
      setDoc(doc(asUser('new_invited_operator'), 'users/new_invited_operator'), {
        ...profile,
        uid: 'new_invited_operator',
        email: 'invited@example.com',
        accountStatus: 'invited',
        pendingInvitationPath: '/invitations/access/invite_1?token=redacted',
      })
    );
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
      { accountStatus: 'invited' },
      { status: 'suspended' },
      { points: 9999 },
      { walletBalance: 9999 },
    ]) {
      await assertFails(updateDoc(profileRef, protectedUpdate));
    }
  });

  it('refuses athlete self-editing entirely, story fields included', async () => {
    // Athletes became managed profiles on 2026-08-22. This test previously asserted the
    // opposite — that an athlete could edit their own bio and impact needs — and inverting
    // it is the point: a public sporting record is written by the club that knows what is
    // true, and an athlete no longer needs an account to exist in that record at all.
    const athleteRef = doc(asUser(OUTSIDER), 'athletes/athlete_001');

    for (const attemptedUpdate of [
      { bio: 'Updated athlete story' },
      { impactNeeds: ['Training boots'] },
      { name: 'Renamed By Self' },
      { avatarUrl: 'https://example.test/self.png' },
      { teamId: 'team_b' },
      { verified: false },
      { verificationStatus: 'pending' },
      { stats: { appearances: 99 } },
      { totalSupport: 9999 },
      { goalPlacePoints: 9999 },
    ]) {
      await assertFails(updateDoc(athleteRef, attemptedUpdate));
    }
  });

  it('closes athlete payout identity to every client credential, super_admin included', async () => {
    // Payout details are read by one server command and handed to the payment provider. A
    // console that can display an account number is a console that can leak one.
    //
    // super_admin is in this list now. It could not be while the `{document=**}` catch-all
    // granted a blanket read, because Firestore grants on ANY matching allow and no deny can
    // override it — narrowing that catch-all is what made the guarantee real rather than
    // aspirational.
    for (const context of [
      asUser(OUTSIDER),
      asUser(TEAM_A_ADMIN),
      asUser(LEAGUE_ADMIN),
      asUserWithClaims('user_platform_payee', { role: 'platform_admin' }),
      asUserWithClaims('user_super_payee', { role: 'super_admin' }),
    ]) {
      const payeeRef = doc(context, 'athletePayees/athlete_001');
      await assertFails(getDoc(payeeRef));
      await assertFails(setDoc(payeeRef, { status: 'verified' }));
    }
  });

  it('gives an unmodelled collection to nobody, not even super_admin', async () => {
    // What the narrowed catch-all now means: a collection someone adds without writing a
    // rule for it is unreadable rather than silently super_admin-readable. That default is
    // the reason the payout guarantee above holds.
    for (const context of [
      asUser(OUTSIDER),
      asUserWithClaims('user_super_catchall', { role: 'super_admin' }),
    ]) {
      await assertFails(getDoc(doc(context, 'someCollectionNobodyModelled/doc_1')));
      await assertFails(setDoc(doc(context, 'someCollectionNobodyModelled/doc_1'), { a: 1 }));
    }
  });

  it('accepts the exact document the live registration path writes', async () => {
    // Pinned against src/lib/firebase/auth.ts `registerAccount`, which is what /register
    // calls. A ruleset that refuses this payload does not "lag" — it breaks public signup,
    // and the failure is invisible until a real person tries to create an account.
    const uid = 'user_new_signup';
    await assertSucceeds(setDoc(doc(asUser(uid), `users/${uid}`), {
      uid,
      email: 'new@example.test',
      name: 'New Supporter',
      role: 'fan',
      accountClass: 'fan',
      accountStatus: 'active',
      status: 'active',
      points: 0,
      walletBalance: 0,
      followedAthletes: [],
      followedTeams: [],
      followedLeagues: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  });

  it('refuses a signup document carrying keys nobody asked for', async () => {
    // The allowlist has to bite, or restoring it was decoration. `accountClass` is permitted
    // above precisely because it carries no authority; an unlisted field is refused outright
    // rather than being quietly stored for something later to read.
    const uid = 'user_sneaky_signup';
    await assertFails(setDoc(doc(asUser(uid), `users/${uid}`), {
      uid,
      email: 'sneaky@example.test',
      name: 'Sneaky',
      role: 'fan',
      accountClass: 'fan',
      status: 'active',
      points: 0,
      walletBalance: 0,
      followedAthletes: [],
      followedTeams: [],
      followedLeagues: [],
      capabilities: ['platform.admin.manage'],
    }));
  });

  it('gives a Platform Admin browser no direct write path around the command layer', async () => {
    // C4. `isPlatformAdmin()` grants on a role claim alone, so a Platform Admin browser could
    // edit these collections directly — skipping the command layer's capability check,
    // validation, reason and audit entry. A governance model the browser can walk around is
    // not a governance model.
    const platform = asUserWithClaims('user_platform_bypass', { role: 'platform_admin' });
    for (const path of [
      'athletes/athlete_001',
      'sports/football',
      'sponsors/sponsor_1',
      'awards/award_1',
      'sponsorCampaigns/campaign_1',
      'leagues/league_new_from_browser',
    ]) {
      await assertFails(setDoc(doc(platform, path), { name: '__rules_smoke', __probe: true }));
    }
  });

  it('lets nobody delete provenance from a browser, super_admin included', async () => {
    // C5. A stolen super_admin session could delete result submissions and their nested
    // events — the append-only record of who submitted a result, who disputed it, and how it
    // changed. That is history destruction wearing an administrator's badge.
    const superAdmin = asUserWithClaims('user_super_delete', { role: 'super_admin' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'resultSubmissions/match_delete_probe'), {
        matchId: 'match_delete_probe', leagueId: 'league_a', status: 'confirmed',
      });
      await setDoc(doc(ctx.firestore(), 'resultSubmissions/match_delete_probe/events/event_1'), {
        submissionId: 'match_delete_probe', actor: 'system',
      });
    });
    await assertFails(deleteDoc(doc(superAdmin, 'resultSubmissions/match_delete_probe')));
    await assertFails(deleteDoc(doc(superAdmin, 'resultSubmissions/match_delete_probe/events/event_1')));
    await assertFails(deleteDoc(doc(superAdmin, 'athletes/athlete_001')));
    await assertFails(deleteDoc(doc(superAdmin, 'teams/team_a')));
  });

  it('publishes result provenance without naming who was excluded', async () => {
    /**
     * H4. `officialMatchReconciliation` was world-readable and carries eligibility issues:
     * athlete ids, claimed versus registered teams, and reasons like
     * `not_registered_to_claimed_team`. Publishing an incomplete sporting record honestly
     * does not require publishing which named individual was excluded from it and why.
     */
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'publicResultProvenance/match_001_v1'), {
        matchId: 'match_001', formulaVersion: 'v1', status: 'balanced', eligibilityIssueCount: 2,
      });
      await setDoc(doc(ctx.firestore(), 'officialMatchReconciliation/match_001_v1'), {
        matchId: 'match_001', leagueId: 'league_001',
        eligibilityIssues: [{ athleteId: 'athlete_a_1', reason: 'not_registered_to_claimed_team' }],
      });
    });

    // The safe half stays public: a verified result still explains itself.
    await assertSucceeds(getDoc(doc(asUser(OUTSIDER), 'publicResultProvenance/match_001_v1')));

    // The operational half is not for anonymous readers.
    await assertFails(getDoc(doc(asUser(OUTSIDER), 'officialMatchReconciliation/match_001_v1')));

    // The governing League still sees it, because they are who acts on it.
    await assertSucceeds(getDoc(doc(asUser(LEAGUE_ADMIN), 'officialMatchReconciliation/match_001_v1')));
  });

  it('gives a Platform Admin browser no write path on any command-owned surface', async () => {
    /**
     * B2, and the reason the earlier version of this test was not enough.
     *
     * The previous test listed a few collections and proved those were closed. It could not
     * prove the general rule, and the bypass had moved somewhere a collection list would
     * never look: `canManageLeagueById` and `canManageTeamById` both began with
     * `isPlatformAdmin() ||`, so every write rule built on them still carried a role-only
     * path — result adjudication included. A Platform Admin could alter a corrected score
     * directly, skipping platform.trust.decide, its reason and its audit entry, and the
     * finalizer would consume that as sporting truth.
     *
     * This enumerates the surfaces named in the audit rather than a sample.
     */
    const platform = asUserWithClaims('user_platform_writes', { role: 'platform_admin' });

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'resultSubmissions/match_adjudicate'), {
        matchId: 'match_adjudicate', leagueId: 'league_001',
        submittedByTeamId: 'team_a', opponentTeamId: 'team_b',
        status: 'pending_confirmation', homeScore: 1, awayScore: 0,
      });
      await setDoc(doc(ctx.firestore(), 'rosters/roster_1'), { teamId: 'team_a', leagueId: 'league_001' });
      await setDoc(doc(ctx.firestore(), 'leagueNotices/notice_1'), { leagueId: 'league_001', audience: 'public' });
      await setDoc(doc(ctx.firestore(), 'leagueAdminApplications/application_1'), { userId: 'someone', status: 'pending' });
      await setDoc(doc(ctx.firestore(), 'verifications/verification_1'), { leagueId: 'league_001' });
    });

    // Adjudicating a result — the one that reaches sporting truth.
    await assertFails(updateDoc(doc(platform, 'resultSubmissions/match_adjudicate'), {
      correctedHomeScore: 9, status: 'resolved',
    }));
    // Creating a club.
    await assertFails(setDoc(doc(platform, 'teams/team_from_browser'), {
      name: 'Browser Team', leagueId: 'league_001', adminUserIds: [], verified: false,
    }));
    // Approving a roster.
    await assertFails(updateDoc(doc(platform, 'rosters/roster_1'), { status: 'approved' }));
    // Publishing a league notice.
    await assertFails(updateDoc(doc(platform, 'leagueNotices/notice_1'), { body: 'Published from a browser' }));
    // Reviewing an application.
    await assertFails(updateDoc(doc(platform, 'leagueAdminApplications/application_1'), { status: 'approved' }));
    // Creating and updating a verification record.
    await assertFails(setDoc(doc(platform, 'verifications/verification_new'), { leagueId: 'league_001' }));
    await assertFails(updateDoc(doc(platform, 'verifications/verification_1'), { status: 'verified' }));
  });

  it('still lets a Platform Admin read what they operate', async () => {
    // The split has to keep reads working, or the console goes blind and the fix reads as
    // breakage rather than hardening.
    const platform = asUserWithClaims('user_platform_reads', { role: 'platform_admin' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'resultSubmissions/match_readable'), {
        matchId: 'match_readable', leagueId: 'league_001',
        submittedByTeamId: 'team_a', opponentTeamId: 'team_b', status: 'confirmed',
      });
    });
    await assertSucceeds(getDoc(doc(platform, 'resultSubmissions/match_readable')));
  });

  it('publishes site settings to everyone and lets nobody write them', async () => {
    // Public because the site renders from it; unwritable because every change belongs to
    // the audited settings command, which is also what keeps governed switches off it.
    await assertSucceeds(getDoc(doc(asUser(OUTSIDER), 'platformSettings/site')));
    for (const context of [
      asUser(OUTSIDER),
      asUserWithClaims('user_platform_settings', { role: 'platform_admin' }),
      asUserWithClaims('user_super_settings', { role: 'super_admin' }),
    ]) {
      await assertFails(setDoc(doc(context, 'platformSettings/site'), { fantasyVisible: false }));
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

  it('ties a league decision to the authenticated admin', async () => {
    await seedSubmission({ status: 'disputed' });
    await assertFails(
      updateDoc(doc(asUser(LEAGUE_ADMIN), 'resultSubmissions/match_001'), {
        status: 'confirmed',
        resolution: 'league_upheld',
        resolvedByUserId: OUTSIDER,
      })
    );
  });

  it('requires corrected provenance when the league changes the score', async () => {
    await seedSubmission({ status: 'disputed' });
    await assertFails(
      updateDoc(doc(asUser(LEAGUE_ADMIN), 'resultSubmissions/match_001'), {
        status: 'confirmed',
        resolution: 'league_upheld',
        resolvedByUserId: LEAGUE_ADMIN,
        correctedHomeScore: 4,
        correctedAwayScore: 0,
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

  it('requires correction requests to use the trusted server endpoint', async () => {
    await seedSubmission({
      status: 'official',
      finalizedAt: '2026-03-02T00:00:00.000Z',
    });
    const ref = doc(asUser(LEAGUE_ADMIN), 'resultSubmissions/match_001');
    await assertFails(
      updateDoc(ref, {
        correctionReason: 'Referee report corrected the score.',
        correctionRequestedBy: LEAGUE_ADMIN,
      })
    );
    await assertFails(
      updateDoc(ref, {
        correctionReason: 'Spoofed request.',
        correctionRequestedBy: OUTSIDER,
      })
    );
  });
});

describe('audit trail is append-only', () => {
  beforeEach(() => seedSubmission());

  it('allows a transition and matching event in one batch', async () => {
    const db = asUser(TEAM_B_ADMIN);
    const batch = writeBatch(db);
    batch.update(doc(db, 'resultSubmissions/match_001'), {
      status: 'confirmed',
      resolution: 'opponent_confirmed',
      respondedByUserId: TEAM_B_ADMIN,
      respondedAt: '2026-03-02T00:00:00.000Z',
    });
    batch.set(doc(db, 'resultSubmissions/match_001/events/e1'), {
      submissionId: 'match_001',
      from: 'pending_confirmation',
      to: 'confirmed',
      actor: 'opponent_team',
      actorUserId: TEAM_B_ADMIN,
      createdAt: '2026-03-02T00:00:00.000Z',
    });
    await assertSucceeds(batch.commit());
  });

  it('refuses an event that does not match a real transition', async () => {
    await assertFails(
      setDoc(doc(asUser(TEAM_B_ADMIN), 'resultSubmissions/match_001/events/fabricated'), {
        submissionId: 'match_001',
        from: 'pending_confirmation',
        to: 'confirmed',
        actor: 'opponent_team',
        actorUserId: TEAM_B_ADMIN,
        createdAt: '2026-03-02T00:00:00.000Z',
      })
    );
  });

  it('refuses a no-op event at the current status', async () => {
    await assertFails(
      setDoc(doc(asUser(TEAM_A_ADMIN), 'resultSubmissions/match_001/events/noop'), {
        submissionId: 'match_001',
        from: 'pending_confirmation',
        to: 'pending_confirmation',
        actor: 'submitting_team',
        actorUserId: TEAM_A_ADMIN,
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

  it('are command-owned and not directly writable by browser roles', async () => {
    await assertFails(
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

describe('new operational write surfaces', () => {
  it('allows only an athlete owner to propose an unfunded pending challenge', async () => {
    const challenge = {
      athleteId: 'athlete_001',
      leagueId: 'league_001',
      seasonId: 'season_001',
      submittedBy: OUTSIDER,
      status: 'proposed',
      fundingModel: 'non_cash',
      verificationStatus: 'pending',
      totalPledged: 0,
      supportersCount: 0,
    };
    await assertSucceeds(setDoc(doc(asUser(OUTSIDER), 'challenges/proposal'), challenge));
    await assertFails(setDoc(doc(asUser(TEAM_A_ADMIN), 'challenges/spoofed'), {
      ...challenge,
      submittedBy: TEAM_A_ADMIN,
    }));
    await assertFails(setDoc(doc(asUser(OUTSIDER), 'challenges/pre_funded'), {
      ...challenge,
      totalPledged: 50000,
    }));
  });

  it('prevents clients from approving or settling a challenge', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'challenges/review'), {
        athleteId: 'athlete_001',
        leagueId: 'league_001',
        seasonId: 'season_001',
        submittedBy: OUTSIDER,
        status: 'proposed',
        fundingModel: 'non_cash',
        verificationStatus: 'pending',
        totalPledged: 0,
        supportersCount: 0,
      });
    });
    await assertFails(updateDoc(
      doc(asUser(TEAM_A_ADMIN), 'challenges/review'),
      { status: 'team_approved', teamApprovedByUserId: TEAM_A_ADMIN },
    ));
    await assertFails(updateDoc(
      doc(asUser(LEAGUE_ADMIN), 'challenges/review'),
      { status: 'settled' },
    ));
  });

  it('lets a team admin save its roster but not another team roster', async () => {
    const roster = {
      leagueId: 'league_001',
      seasonId: 'season_001',
      teamId: 'team_a',
      athleteIds: ['athlete_001'],
      status: 'draft',
      completeness: 100,
      submittedByUserId: TEAM_A_ADMIN,
    };
    await assertSucceeds(setDoc(doc(asUser(TEAM_A_ADMIN), 'rosters/team_a'), roster));
    await assertFails(setDoc(doc(asUser(TEAM_B_ADMIN), 'rosters/spoofed'), {
      ...roster,
      submittedByUserId: TEAM_B_ADMIN,
    }));
  });

  it('lets a league admin import unassigned pending teams only', async () => {
    const team = {
      leagueId: 'league_001',
      name: 'Imported Team',
      adminUserIds: [],
      verified: false,
    };
    await assertSucceeds(setDoc(doc(asUser(LEAGUE_ADMIN), 'teams/imported'), team));
    await assertFails(setDoc(doc(asUser(LEAGUE_ADMIN), 'teams/self_assigned'), {
      ...team,
      adminUserIds: [LEAGUE_ADMIN],
    }));
  });

  it('binds team invitations to the league and recipient email', async () => {
    const invitation = {
      userId: '',
      teamId: 'team_a',
      leagueId: 'league_001',
      seasonId: 'season_001',
      role: 'team_admin',
      status: 'invited',
      invitedByUserId: LEAGUE_ADMIN,
      invitedEmail: 'invitee@example.com',
    };
    await assertFails(
      setDoc(doc(asUser(LEAGUE_ADMIN), 'teamAssignments/invite'), invitation)
    );
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'teamAssignments/invite'), invitation);
    });
    await assertSucceeds(
      getDoc(doc(
        asUserWithClaims('invitee', { email: 'invitee@example.com' }),
        'teamAssignments/invite',
      ))
    );
    await assertFails(
      getDoc(doc(
        asUserWithClaims('wrong_user', { email: 'wrong@example.com' }),
        'teamAssignments/invite',
      ))
    );
  });

  it('allows a user to apply for League Admin without granting the role', async () => {
    await assertSucceeds(
      setDoc(doc(asUser(OUTSIDER), 'leagueAdminApplications/application'), {
        userId: OUTSIDER,
        leagueName: 'New League',
        city: 'Jinja',
        sport: 'football',
        evidenceNote: 'Authorized operator',
        status: 'pending',
      })
    );
    await assertFails(
      setDoc(doc(asUser(OUTSIDER), 'leagueAdminApplications/preapproved'), {
        userId: OUTSIDER,
        status: 'approved',
      })
    );
  });

  it('keeps admin audit events immutable and platform-admin only', async () => {
    const platform = asUserWithClaims('platform', { role: 'platform_admin' });
    await assertFails(setDoc(doc(platform, 'adminAuditEvents/decision'), {
      actorUserId: 'platform',
      action: 'approved',
      targetCollection: 'athletes',
      targetId: 'athlete_001',
    }));
    await assertFails(updateDoc(doc(platform, 'adminAuditEvents/decision'), {
      action: 'rejected',
    }));
    await assertFails(getDoc(doc(asUser(OUTSIDER), 'adminAuditEvents/decision')));
  });

  it('gives Super Admin browser clients no catch-all read or write bypass', async () => {
    const superAdmin = asUserWithClaims('super', { role: 'super_admin' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'serverOnlyRecords/secret'), {
        value: 'server-owned',
      });
      await setDoc(doc(ctx.firestore(), 'adminLogs/existing'), {
        actorUserId: 'platform',
        action: 'legacy_event',
      });
      await setDoc(doc(ctx.firestore(), 'accessAssignments/assignment_1'), {
        userId: OUTSIDER,
        roleKey: 'team_admin',
        scopeType: 'team',
        scopeId: 'team_a',
        status: 'active',
      });
    });

    // This read asserted success until 2026-08-22, when the catch-all stopped granting
    // super_admin a blanket read. It was the reason `athletePayees` could not be closed:
    // Firestore grants on ANY matching allow, so a role-shaped exemption here overrode every
    // specific deny in the file. Server-owned data is now server-owned from every client.
    await assertFails(getDoc(doc(superAdmin, 'serverOnlyRecords/secret')));
    await assertFails(setDoc(doc(superAdmin, 'serverOnlyRecords/forged'), { value: 'forged' }));
    await assertFails(updateDoc(doc(superAdmin, 'serverOnlyRecords/secret'), { value: 'rewritten' }));
    await assertFails(setDoc(doc(superAdmin, 'adminLogs/forged'), {
      actorUserId: 'super',
      action: 'forged',
    }));
    await assertFails(updateDoc(doc(superAdmin, 'adminLogs/existing'), { action: 'rewritten' }));
    await assertFails(deleteDoc(doc(superAdmin, 'adminLogs/existing')));
    await assertFails(updateDoc(doc(superAdmin, 'accessAssignments/assignment_1'), { status: 'revoked' }));
  });

  it('lets notification owners change only read state', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'notifications/notice'), {
        userId: OUTSIDER,
        title: 'Original title',
        body: 'Original body',
        read: false,
      });
    });
    const ref = doc(asUser(OUTSIDER), 'notifications/notice');
    await assertSucceeds(updateDoc(ref, { read: true }));
    await assertFails(updateDoc(ref, { title: 'Spoofed' }));
  });

  it('lets athlete owners propose support needs but not self-approve or alter raised money', async () => {
    const need = {
      athleteId: 'athlete_001',
      leagueId: 'league_001',
      title: 'Transport',
      story: 'Away fixtures',
      targetAmount: 200000,
      raisedAmount: 0,
      status: 'open',
      approvalStatus: 'proposed',
      verificationStatus: 'pending',
      preferredPayoutDestination: 'approved_vendor',
      payoutDestinationStatus: 'pending_verification',
      recipientUpdates: [],
      createdByUserId: OUTSIDER,
    };
    const ref = doc(asUser(OUTSIDER), 'supportNeeds/need');
    await assertSucceeds(setDoc(ref, need));
    await assertFails(updateDoc(ref, {
      recipientUpdates: [{ id: 'update', message: 'First update' }],
    }));
    await assertFails(updateDoc(ref, {
      approvalStatus: 'league_approved',
      verificationStatus: 'verified',
    }));
    await assertFails(updateDoc(ref, { raisedAmount: 200000 }));

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'supportNeeds/need'), {
        approvalStatus: 'league_approved',
        verificationStatus: 'verified',
      });
    });
    await assertSucceeds(updateDoc(ref, {
      recipientUpdates: [{ id: 'update', message: 'First verified update' }],
    }));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'supportNeeds/need'), {
        status: 'completed',
      });
    });
    await assertFails(updateDoc(ref, {
      recipientUpdates: [{ id: 'replacement', message: 'Replaced after completion' }],
    }));
  });
});

describe('money and points trust boundary', () => {
  const PLATFORM_ADMIN = 'user_platform';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'paymentIntents/pi_001'), {
        supporterUserId: OUTSIDER,
        supportAmountMinor: 10000,
        platformFeeMinor: 500,
        totalAmountMinor: 10500,
        currency: 'UGX',
        status: 'payment_pending',
      });
      await setDoc(doc(db, 'contributions/c_001'), {
        supporterUserId: OUTSIDER,
        supportAmountMinor: 10000,
        status: 'allocated',
      });
      await setDoc(doc(db, 'pointsEvents/p_001'), {
        userId: OUTSIDER,
        actionType: 'verified_need_supported',
        points: 10,
        status: 'confirmed',
      });
      await setDoc(doc(db, 'ledgerTransactions/l_001'), {
        type: 'contribution_settlement',
        relatedEntityId: 'c_001',
      });
      await setDoc(doc(db, 'ledgerEntries/le_001'), {
        transactionId: 'l_001',
        accountCode: 'recipient_payable',
        direction: 'credit',
        amountMinor: 10000,
      });
    });
  });

  it('lets supporters read their payment activity but not another account', async () => {
    await assertSucceeds(getDoc(doc(asUser(OUTSIDER), 'paymentIntents/pi_001')));
    await assertSucceeds(getDoc(doc(asUser(OUTSIDER), 'contributions/c_001')));
    await assertSucceeds(getDoc(doc(asUser(OUTSIDER), 'pointsEvents/p_001')));
    await assertFails(getDoc(doc(asUser(TEAM_A_ADMIN), 'contributions/c_001')));
  });

  it('keeps the ledger restricted to platform operators', async () => {
    await assertFails(getDoc(doc(asUser(OUTSIDER), 'ledgerTransactions/l_001')));
    await assertFails(getDoc(doc(asUser(OUTSIDER), 'ledgerEntries/le_001')));
    await assertSucceeds(
      getDoc(doc(
        asUserWithClaims(PLATFORM_ADMIN, { role: 'platform_admin' }),
        'ledgerTransactions/l_001',
      )),
    );
  });

  it('refuses financial and points writes from every client role', async () => {
    for (const db of [
      asUser(OUTSIDER),
      asUser(LEAGUE_ADMIN),
      asUserWithClaims(PLATFORM_ADMIN, { role: 'platform_admin' }),
    ]) {
      await assertFails(setDoc(doc(db, 'paymentIntents/forged'), {
        supporterUserId: OUTSIDER,
        totalAmountMinor: 1,
        status: 'settled',
      }));
      await assertFails(setDoc(doc(db, 'contributions/forged'), {
        supporterUserId: OUTSIDER,
        status: 'allocated',
      }));
      await assertFails(setDoc(doc(db, 'ledgerEntries/forged'), {
        direction: 'credit',
        amountMinor: 500000,
      }));
      await assertFails(setDoc(doc(db, 'pointsEvents/forged'), {
        userId: OUTSIDER,
        points: 999999,
        status: 'confirmed',
      }));
      await assertFails(setDoc(doc(db, 'supportReservations/forged'), {
        supportNeedId: 'need_001',
        paymentIntentId: 'pi_001',
        supporterUserId: OUTSIDER,
        amountMinor: 10000,
        status: 'active',
      }));
      await assertFails(setDoc(doc(db, 'recipientEligibility/forged'), {
        recipientType: 'athlete',
        recipientId: 'athlete_001',
        status: 'eligible',
        supportEnabled: true,
      }));
    }
  });

  it('refuses legacy wallet and pledge creation', async () => {
    const db = asUser(OUTSIDER);
    await assertFails(setDoc(doc(db, 'walletTransactions/deposit'), {
      userId: OUTSIDER,
      amount: 50000,
      type: 'deposit',
    }));
    await assertFails(setDoc(doc(db, 'supportPledges/pledge'), {
      fanId: OUTSIDER,
      amount: 50000,
      status: 'held',
    }));
  });
});

describe('trusted completion and attendance records', () => {
  it('refuses support-completion records from every client role', async () => {
    for (const db of [
      asUser(OUTSIDER),
      asUser(LEAGUE_ADMIN),
      asUserWithClaims('platform', { role: 'platform_admin' }),
    ]) {
      await assertFails(setDoc(doc(db, 'supportNeedCompletions/forged'), {
        supportNeedId: 'need_001',
        athleteId: 'athlete_001',
        leagueId: 'league_001',
        reviewedByUserId: LEAGUE_ADMIN,
        evidenceRefs: ['https://example.com/evidence.jpg'],
        status: 'verified',
      }));
    }
  });

  it('refuses match attendance and attendance points from every client role', async () => {
    for (const db of [
      asUser(OUTSIDER),
      asUser(LEAGUE_ADMIN),
      asUserWithClaims('platform', { role: 'platform_admin' }),
    ]) {
      await assertFails(setDoc(doc(db, 'matchAttendance/forged'), {
        matchId: 'match_001',
        userId: OUTSIDER,
        leagueId: 'league_001',
      }));
      await assertFails(setDoc(doc(db, 'pointsEvents/attendance_forged'), {
        userId: OUTSIDER,
        actionType: 'match_attended',
        points: 15,
        status: 'confirmed',
      }));
    }
  });
});

describe('community publishing trust boundary', () => {
  const fanPost = {
    authorId: OUTSIDER,
    caption: 'Looking forward to the weekend fixtures.',
    status: 'active',
    verified: false,
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
  };

  it('allows a fan to publish an ordinary post', async () => {
    await assertSucceeds(setDoc(doc(asUser(OUTSIDER), 'feedPosts/fan_post'), fanPost));
  });

  it('refuses verified posts and fabricated engagement from a fan', async () => {
    await assertFails(setDoc(doc(asUser(OUTSIDER), 'feedPosts/verified_post'), {
      ...fanPost,
      verified: true,
    }));
    await assertFails(setDoc(doc(asUser(OUTSIDER), 'feedPosts/popular_post'), {
      ...fanPost,
      likesCount: 500,
    }));
  });

  it('lets an owner edit copy but not official or engagement fields', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'feedPosts/fan_post'), fanPost);
    });
    const ref = doc(asUser(OUTSIDER), 'feedPosts/fan_post');
    await assertSucceeds(updateDoc(ref, { caption: 'Updated fixture thoughts.' }));
    await assertFails(updateDoc(ref, { verified: true }));
    await assertFails(updateDoc(ref, { status: 'official' }));
    await assertFails(updateDoc(ref, { likesCount: 1000 }));
  });

  it('keeps comment publication and moderation state separate', async () => {
    const comment = {
      authorId: OUTSIDER,
      postId: 'fan_post',
      text: 'Great match.',
      status: 'published',
    };
    const ref = doc(asUser(OUTSIDER), 'comments/comment_001');
    await assertFails(setDoc(ref, comment));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'comments/comment_001'), comment);
    });
    await assertFails(setDoc(doc(asUser(OUTSIDER), 'comments/hidden_comment'), {
      ...comment,
      status: 'hidden',
    }));
    await assertFails(updateDoc(ref, { text: 'Great official match.' }));
    await assertFails(updateDoc(ref, { status: 'hidden' }));
  });
});

describe('notice and sponsor-report visibility', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'leagueNotices/public_notice'), {
        leagueId: 'league_001',
        audience: 'public',
        title: 'Public fixture notice',
      });
      await setDoc(doc(db, 'leagueNotices/admin_notice'), {
        leagueId: 'league_001',
        audience: 'team_admins',
        title: 'Team Admin instructions',
      });
    });
  });

  it('exposes only public notices to logged-out and ordinary fan accounts', async () => {
    const publicDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(publicDb, 'leagueNotices/public_notice')));
    await assertFails(getDoc(doc(publicDb, 'leagueNotices/admin_notice')));
    await assertFails(getDoc(doc(asUser(OUTSIDER), 'leagueNotices/admin_notice')));
    await assertSucceeds(getDoc(doc(asUser(LEAGUE_ADMIN), 'leagueNotices/admin_notice')));
  });

  it('requires sponsor reports to be written by trusted server code', async () => {
    const report = {
      leagueId: 'league_001',
      seasonId: 'season_001',
      campaignId: 'campaign_001',
      verifiedMatches: 99,
    };
    await assertFails(setDoc(doc(asUser(LEAGUE_ADMIN), 'sponsorReports/forged'), report));
    await assertFails(setDoc(
      doc(asUserWithClaims('platform', { role: 'platform_admin' }), 'sponsorReports/forged'),
      report,
    ));
  });
});

describe('GoalPlace Fantasy trust boundary', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'fantasyCompetitions/fantasy_rugby'), {
        name: 'Rugby Fantasy Pilot',
        sport: 'rugby',
        status: 'active',
        isFreeToPlay: true,
      });
      await setDoc(doc(db, 'fantasyLeaderboards/fantasy_rugby_team_1'), {
        competitionId: 'fantasy_rugby',
        fantasyTeamId: 'fantasy_rugby_team_1',
        rank: 1,
        totalPoints: 120,
      });
      await setDoc(doc(db, `fantasyTeams/fantasy_rugby_${OUTSIDER}`), {
        competitionId: 'fantasy_rugby',
        userId: OUTSIDER,
        name: 'Fan XV',
      });
      await setDoc(doc(db, 'fantasyMiniLeagues/private_league'), {
        competitionId: 'fantasy_rugby',
        ownerUserId: TEAM_A_ADMIN,
        name: 'Private table',
        visibility: 'private',
        status: 'active',
      });
      await setDoc(doc(db, `fantasyMiniLeagueMembers/private_league_${OUTSIDER}`), {
        miniLeagueId: 'private_league',
        competitionId: 'fantasy_rugby',
        userId: OUTSIDER,
        fantasyTeamId: `fantasy_rugby_${OUTSIDER}`,
        status: 'active',
      });
      await setDoc(doc(db, `fantasyMiniLeagueMembers/private_league_${TEAM_B_ADMIN}`), {
        miniLeagueId: 'private_league',
        competitionId: 'fantasy_rugby',
        userId: TEAM_B_ADMIN,
        fantasyTeamId: `fantasy_rugby_${TEAM_B_ADMIN}`,
        status: 'pending',
      });
    });
  });

  it('allows public competition and leaderboard reads', async () => {
    const publicDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(publicDb, 'fantasyCompetitions/fantasy_rugby')));
    await assertSucceeds(getDoc(doc(publicDb, 'fantasyLeaderboards/fantasy_rugby_team_1')));
  });

  it('lets a manager read only their own private team', async () => {
    await assertSucceeds(getDoc(doc(
      asUser(OUTSIDER),
      `fantasyTeams/fantasy_rugby_${OUTSIDER}`,
    )));
    await assertFails(getDoc(doc(
      asUser(TEAM_B_ADMIN),
      `fantasyTeams/fantasy_rugby_${OUTSIDER}`,
    )));
  });

  it('allows a member to read their private mini-league', async () => {
    await assertSucceeds(getDoc(doc(
      asUser(OUTSIDER),
      'fantasyMiniLeagues/private_league',
    )));
    await assertFails(getDoc(doc(
      asUser(TEAM_B_ADMIN),
      'fantasyMiniLeagues/private_league',
    )));
  });

  it('refuses every client write to official fantasy outputs', async () => {
    for (const db of [
      asUser(OUTSIDER),
      asUser(LEAGUE_ADMIN),
      asUserWithClaims('platform', { role: 'platform_admin' }),
    ]) {
      await assertFails(setDoc(doc(db, 'fantasyPointEvents/forged'), {
        competitionId: 'fantasy_rugby',
        athleteId: 'athlete_001',
        basePoints: 999,
        status: 'official',
      }));
      await assertFails(setDoc(doc(db, 'fantasyRoundScores/forged'), {
        competitionId: 'fantasy_rugby',
        fantasyTeamId: `fantasy_rugby_${OUTSIDER}`,
        totalPoints: 999,
      }));
      await assertFails(setDoc(doc(db, 'fantasyLeaderboards/forged'), {
        competitionId: 'fantasy_rugby',
        rank: 1,
        totalPoints: 999,
      }));
      await assertFails(setDoc(doc(db, 'fantasyPlayerPrices/forged'), {
        competitionId: 'fantasy_rugby',
        athleteId: 'athlete_001',
        credits: 1,
      }));
      await assertFails(setDoc(doc(db, 'fantasyCorrections/forged'), {
        competitionId: 'fantasy_rugby',
        oldTotals: {},
        newTotals: { forged: 999 },
      }));
    }
  });

  it('requires validated server APIs for teams and mini-league membership', async () => {
    await assertFails(setDoc(doc(asUser(OUTSIDER), 'fantasyTeams/second_entry'), {
      competitionId: 'fantasy_rugby',
      userId: OUTSIDER,
      name: 'Second illegal entry',
    }));
    await assertFails(setDoc(doc(asUser(OUTSIDER), 'fantasyLineupVersions/late_lineup'), {
      fantasyTeamId: `fantasy_rugby_${OUTSIDER}`,
      competitionId: 'fantasy_rugby',
      status: 'locked',
    }));
    await assertFails(setDoc(doc(asUser(OUTSIDER), 'fantasyMiniLeagueMembers/forged'), {
      miniLeagueId: 'private_league',
      userId: OUTSIDER,
      status: 'active',
    }));
  });
});

/**
 * The canonical-authority denial matrix.
 *
 * These pin the property the migration exists to establish: authority comes from the
 * accessIndex projection and from nothing else. A revoked, suspended or expired
 * assignment leaves no projection, and a legacy adminUserIds entry is not a grant.
 */
describe('canonical access authority', () => {
  it('allows a team admin holding a canonical grant', async () => {
    await assertSucceeds(setDoc(
      doc(asUser(TEAM_A_ADMIN), 'resultSubmissions/match_001'),
      submissionDoc(),
    ));
  });

  it('denies a team admin acting on a team they do not hold', async () => {
    await assertFails(setDoc(
      doc(asUser(TEAM_B_ADMIN), 'resultSubmissions/match_001'),
      submissionDoc(),
    ));
  });

  it.each([
    ['revoked', REVOKED_ADMIN],
    ['suspended', SUSPENDED_ADMIN],
    ['expired', EXPIRED_ADMIN],
  ])('denies a %s assignment even though the legacy array still lists the user', async (_label, uid) => {
    // The projector deletes the index when no active assignment remains. This is the
    // exact case a `legacy OR canonical` rule would have kept authorizing.
    await assertFails(setDoc(
      doc(asUser(uid), 'resultSubmissions/match_001'),
      submissionDoc({ submittedByUserId: uid }),
    ));
  });

  it('denies a user present only in the legacy adminUserIds array', async () => {
    await assertFails(setDoc(
      doc(asUser(LEGACY_ONLY_ADMIN), 'resultSubmissions/match_001'),
      submissionDoc({ submittedByUserId: LEGACY_ONLY_ADMIN }),
    ));
  });

  it('denies a fan with no assignment anywhere', async () => {
    await assertFails(setDoc(
      doc(asUser(OUTSIDER), 'resultSubmissions/match_001'),
      submissionDoc({ submittedByUserId: OUTSIDER }),
    ));
  });

  it('denies an unauthenticated caller', async () => {
    await assertFails(setDoc(
      doc(testEnv.unauthenticatedContext().firestore(), 'resultSubmissions/match_001'),
      submissionDoc(),
    ));
  });

  it('enforces capability granularity on team profile edits', async () => {
    // Results-only holds a team grant, so it may report results...
    await assertSucceeds(setDoc(
      doc(asUser(RESULTS_ONLY), 'resultSubmissions/match_001'),
      submissionDoc({ submittedByUserId: RESULTS_ONLY }),
    ));
    // ...but profile editing requires team.profile.manage specifically.
    await assertFails(updateDoc(doc(asUser(RESULTS_ONLY), 'teams/team_a'), {
      name: 'Renamed by a results reporter',
    }));
  });

  it('allows a team profile edit for a holder of team.profile.manage', async () => {
    await assertSucceeds(updateDoc(doc(asUser(TEAM_A_ADMIN), 'teams/team_a'), {
      name: 'Team A Renamed',
    }));
  });

  it('denies a league profile edit from a team admin of that league', async () => {
    await assertFails(updateDoc(doc(asUser(TEAM_A_ADMIN), 'leagues/league_001'), {
      name: 'Renamed by a team admin',
    }));
  });

  it('allows a league profile edit for the assigned league admin', async () => {
    await assertSucceeds(updateDoc(doc(asUser(LEAGUE_ADMIN), 'leagues/league_001'), {
      name: 'League Renamed',
    }));
  });

  it('denies a league admin of another league', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'leagues/league_002'), { name: 'Other', adminUserIds: [] });
    });
    await assertFails(updateDoc(doc(asUser(LEAGUE_ADMIN), 'leagues/league_002'), {
      name: 'Cross-league edit',
    }));
  });

  it('nobody with a client credential may write the access index itself', async () => {
    // If a client could author this document it could grant itself any capability.
    for (const uid of [TEAM_A_ADMIN, LEAGUE_ADMIN, OUTSIDER]) {
      await assertFails(setDoc(
        doc(asUser(uid), `accessIndex/team_team_a_${uid}`),
        accessIndexDoc(uid, 'team', 'team_a', TEAM_CAPABILITIES),
      ));
    }
  });

  it('nobody with a client credential may write an access assignment', async () => {
    for (const uid of [TEAM_A_ADMIN, LEAGUE_ADMIN, OUTSIDER]) {
      await assertFails(setDoc(doc(asUser(uid), `accessAssignments/forged_${uid}`), {
        userId: uid,
        roleKey: 'team_admin',
        scopeType: 'team',
        scopeId: 'team_a',
        status: 'active',
      }));
    }
  });

  it('denies escalation by adding yourself to a legacy admin array', async () => {
    await assertFails(updateDoc(doc(asUser(OUTSIDER), 'teams/team_a'), {
      adminUserIds: [OUTSIDER],
    }));
  });
});

/**
 * The upload lifecycle is server-owned end to end. A client that could write any of
 * these could authorize its own upload, mark it verified, or approve its own moderation.
 */
describe('media lifecycle is server-owned', () => {
  it('denies a client authorizing its own upload session', async () => {
    await assertFails(setDoc(doc(asUser(TEAM_A_ADMIN), 'uploadSessions/forged'), {
      actorUserId: TEAM_A_ADMIN,
      storagePath: 'publishedMedia/team/team_a/forged.jpg',
      status: 'authorized',
    }));
  });

  it('denies a client creating or publishing its own media record', async () => {
    await assertFails(setDoc(doc(asUser(TEAM_A_ADMIN), 'mediaRecords/forged'), {
      actorUserId: TEAM_A_ADMIN,
      storagePath: 'publishedMedia/team/team_a/forged.jpg',
      moderationStatus: 'approved',
      published: true,
    }));
  });

  it('hides a media record that has not been approved from other accounts', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'mediaRecords/pending_1'), {
        actorUserId: TEAM_A_ADMIN,
        storagePath: 'publishedMedia/team/team_a/pending.jpg',
        moderationStatus: 'pending_review',
        published: false,
      });
    });

    // The uploader may see their own pending upload; nobody else may.
    await assertSucceeds(getDoc(doc(asUser(TEAM_A_ADMIN), 'mediaRecords/pending_1')));
    await assertFails(getDoc(doc(asUser(OUTSIDER), 'mediaRecords/pending_1')));
  });

  it('exposes a media record once it is published', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'mediaRecords/published_1'), {
        actorUserId: TEAM_A_ADMIN,
        storagePath: 'publishedMedia/team/team_a/published.jpg',
        moderationStatus: 'approved',
        published: true,
      });
    });

    await assertSucceeds(getDoc(doc(asUser(OUTSIDER), 'mediaRecords/published_1')));
  });

  it('denies a client writing a security event or a reconciliation record', async () => {
    await assertFails(setDoc(doc(asUser(TEAM_A_ADMIN), 'securityEvents/forged'), { type: 'forged' }));
    await assertFails(setDoc(doc(asUser(TEAM_A_ADMIN), 'officialMatchReconciliation/forged'), {
      matchId: 'match_001',
      status: 'valid',
    }));
  });
});

describe('environment activation records', () => {
  it('denies a client forging an activation approval', async () => {
    // The second-operator approval is the control this workflow exists to enforce. A client
    // able to write these could approve its own activation request.
    await assertFails(
      setDoc(doc(asUser(LEAGUE_ADMIN), 'environmentActivations/forged'), {
        environment: 'production',
        stage: 'approved',
        requestedByUserId: LEAGUE_ADMIN,
        approvedByUserId: LEAGUE_ADMIN,
      }),
    );
    await assertFails(
      setDoc(doc(asUser(TEAM_A_ADMIN), 'environmentActivations/forged_2'), { stage: 'completed' }),
    );
  });
});

describe('reconciliation exceptions', () => {
  async function seedException() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'reconciliationExceptions/reconciliation_match_001_1'), {
        exceptionId: 'reconciliation_match_001_1',
        matchId: 'match_001',
        leagueId: 'league_001',
        submissionId: 'match_001',
        submissionVersion: 1,
        officialHomeScore: 2,
        reconstructedHomeScore: 3,
        homeDifference: 1,
        status: 'open',
        reviewStatus: 'league_review_required',
      });
    });
  }

  it('lets the governing league read a blocked result', async () => {
    await seedException();

    // Without an explicit rule this collection falls through to the catch-all, which
    // grants read to super_admin only — the League queue would render empty and the case
    // would be invisible to the only people who can resolve it.
    await assertSucceeds(
      getDoc(doc(asUser(LEAGUE_ADMIN), 'reconciliationExceptions/reconciliation_match_001_1'))
    );
  });

  it('denies an unrelated user', async () => {
    await seedException();

    await assertFails(
      getDoc(doc(asUser(OUTSIDER), 'reconciliationExceptions/reconciliation_match_001_1'))
    );
  });

  it('denies a client moving the workflow state, even to a legitimate value', async () => {
    await seedException();

    // Case transitions go through the audited platform command, which writes with the
    // Admin SDK. A client that could set `resolved` directly would close a blocked official
    // result with no capability check and no audit entry.
    for (const status of ['acknowledged', 'escalated', 'resolved']) {
      await assertFails(
        setDoc(
          doc(asUser(LEAGUE_ADMIN), 'reconciliationExceptions/reconciliation_match_001_1'),
          { status },
          { merge: true },
        ),
      );
    }
  });

  it('denies every client write, including the governing league', async () => {
    await seedException();

    // Only the finalizer writes these, through the Admin SDK. A league resolves a case
    // through a reviewed command, never by editing the evidence.
    await assertFails(
      setDoc(doc(asUser(LEAGUE_ADMIN), 'reconciliationExceptions/reconciliation_match_001_1'), {
        status: 'resolved',
      })
    );
    await assertFails(
      setDoc(doc(asUser(TEAM_A_ADMIN), 'reconciliationExceptions/forged'), {
        matchId: 'match_001',
        leagueId: 'league_001',
        status: 'open',
      })
    );
  });
});

describe('team affiliations grant nothing and are readable by nobody', () => {
  async function seedAffiliation() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'teamAffiliations/affiliation_1'), {
        id: 'affiliation_1',
        userId: LEAGUE_ADMIN,
        teamId: 'team_001',
        leagueId: 'league_001',
        relationship: 'coach',
        basis: 'declared',
        status: 'active',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
      });
    });
  }

  /**
   * ADR-005, invariant 23: `teamAffiliations` is never read by an authorization decision.
   *
   * Enforced here by the collection being unreadable to every client, including the person
   * the record is about and the league that recorded it. The only consumer is
   * resolveConflictContext() under the Admin SDK. If a rule ever needed to read this to
   * decide access, an affiliation would become a permission anybody could award themselves
   * by declaring one.
   */
  it('denies read to the league that recorded it', async () => {
    await seedAffiliation();

    await assertFails(getDoc(doc(asUser(LEAGUE_ADMIN), 'teamAffiliations/affiliation_1')));
  });

  it('denies read to an unrelated user', async () => {
    await seedAffiliation();

    await assertFails(getDoc(doc(asUser(OUTSIDER), 'teamAffiliations/affiliation_1')));
  });

  it('denies a client declaring an affiliation directly', async () => {
    // Declarations are server-authored so that `declaredByUserId` and `basis` mean something.
    // A client-written record could claim to be league_recorded when nobody recorded it.
    await assertFails(
      setDoc(doc(asUser(LEAGUE_ADMIN), 'teamAffiliations/affiliation_self'), {
        userId: LEAGUE_ADMIN,
        teamId: 'team_001',
        leagueId: 'league_001',
        relationship: 'coach',
        basis: 'league_recorded',
        status: 'active',
      }),
    );
  });

  it('denies ending one from the client', async () => {
    await seedAffiliation();

    // Ending an affiliation the moment before adjudicating your own club's match is exactly
    // the move this collection exists to make visible.
    await assertFails(
      setDoc(
        doc(asUser(LEAGUE_ADMIN), 'teamAffiliations/affiliation_1'),
        { status: 'ended' },
        { merge: true },
      ),
    );
  });
});

describe('the athlete persona is the one thing an athlete owns', () => {
  const ATHLETE_USER = 'user_athlete_self';
  const OTHER_ATHLETE_USER = 'user_athlete_other';

  async function seedPersona() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'athletePersonas/athlete_001'), {
        id: 'athlete_001',
        athleteId: 'athlete_001',
        displayName: 'Emma',
        claimedByUserId: ATHLETE_USER,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      });
      await setDoc(
        doc(db, `accessIndex/athlete_athlete_001_${ATHLETE_USER}`),
        accessIndexDoc(ATHLETE_USER, 'athlete', 'athlete_001', ['athlete.persona.manage']),
      );
      await setDoc(
        doc(db, `accessIndex/athlete_athlete_001_${OTHER_ATHLETE_USER}`),
        accessIndexDoc(OTHER_ATHLETE_USER, 'athlete', 'athlete_001', ['athlete.persona.manage']),
      );
    });
  }

  it('lets the claiming athlete change their nickname', async () => {
    await seedPersona();

    await assertSucceeds(
      setDoc(
        doc(asUser(ATHLETE_USER), 'athletePersonas/athlete_001'),
        { displayName: 'Emma O', updatedAt: '2026-08-24T00:00:00.000Z' },
        { merge: true },
      ),
    );
  });

  /**
   * ADR-001's completion test, and the reason it is asserted here rather than by the absence
   * of a button. The whole athlete experience is built on the claim that giving an athlete a
   * public identity does not give them authority over their sporting record. That claim is
   * only true if the database says so.
   */
  it('does not let a claimed athlete change their registered name', async () => {
    await seedPersona();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'athletes/athlete_001'), {
        id: 'athlete_001',
        legalName: 'Emmanuel Okello',
        registeredPosition: 'Forward',
        teamId: 'team_a',
        leagueId: 'league_001',
      });
    });

    await assertFails(
      setDoc(
        doc(asUser(ATHLETE_USER), 'athletes/athlete_001'),
        { legalName: 'Emma Okello' },
        { merge: true },
      ),
    );
  });

  it('does not let one athlete edit another athlete persona', async () => {
    await seedPersona();

    // Holding athlete-self capability in this scope is not enough: the document has to name
    // them. A projection bug that granted the wrong scope must not become one athlete
    // rewriting another's public identity.
    await assertFails(
      setDoc(
        doc(asUser(OTHER_ATHLETE_USER), 'athletePersonas/athlete_001'),
        { displayName: 'Hijacked' },
        { merge: true },
      ),
    );
  });

  it('does not let an athlete reassign their persona to another account', async () => {
    await seedPersona();

    await assertFails(
      setDoc(
        doc(asUser(ATHLETE_USER), 'athletePersonas/athlete_001'),
        { claimedByUserId: OUTSIDER },
        { merge: true },
      ),
    );
  });

  it('does not let an athlete point their persona at a different athlete', async () => {
    await seedPersona();

    await assertFails(
      setDoc(
        doc(asUser(ATHLETE_USER), 'athletePersonas/athlete_001'),
        { athleteId: 'athlete_999' },
        { merge: true },
      ),
    );
  });

  it('does not let anyone create or delete a persona from the client', async () => {
    await seedPersona();

    // Creating one is what links an account to a registered athlete, so it belongs to claim
    // verification rather than to whoever asks first.
    await assertFails(
      setDoc(doc(asUser(ATHLETE_USER), 'athletePersonas/athlete_002'), {
        athleteId: 'athlete_002',
        claimedByUserId: ATHLETE_USER,
      }),
    );
    await assertFails(deleteDoc(doc(asUser(ATHLETE_USER), 'athletePersonas/athlete_001')));
  });

  it('is publicly readable, because it is a public profile', async () => {
    await seedPersona();

    await assertSucceeds(getDoc(doc(asUser(OUTSIDER), 'athletePersonas/athlete_001')));
  });

  it('keeps stat issues off the client entirely', async () => {
    // One athlete's dispute about their own record is not other athletes' business, and a
    // client-written case could claim to have been raised by somebody else.
    await assertFails(
      setDoc(doc(asUser(ATHLETE_USER), 'athleteStatIssues/issue_1'), {
        athleteId: 'athlete_001',
        raisedByUserId: OUTSIDER,
        category: 'missing_event',
        detail: 'I scored in the second half.',
        status: 'accepted',
      }),
    );
    await assertFails(getDoc(doc(asUser(ATHLETE_USER), 'athleteStatIssues/issue_1')));
  });
});

describe('field capture adds no client write surface', () => {
  /**
   * Every Match Ops write travels through an Admin SDK route, because a Match Ops principal
   * holds a bearer token rather than a Firebase identity and never satisfies
   * `request.auth != null`. These assertions are what keeps that true: a future rule added to
   * one of these collections "to make the client work" would fail here first.
   */
  const SERVER_ONLY = [
    'fieldManagers/fm_1',
    'fieldManagerAssignments/assignment_1',
    'matchAccessSessions/session_1',
    'matchClockStates/match_001',
    'matchLineupSnapshots/match_001',
    'liveMatchEvents/event_1',
    'matchReports/match_001',
  ];

  it.each(SERVER_ONLY)('denies a league operator writing %s directly', async (path) => {
    await assertFails(setDoc(doc(asUser(LEAGUE_ADMIN), path), { matchId: 'match_001', leagueId: 'league_001' }));
  });

  it.each(SERVER_ONLY)('denies reading %s from the client', async (path) => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path), { matchId: 'match_001', leagueId: 'league_001' });
    });

    await assertFails(getDoc(doc(asUser(LEAGUE_ADMIN), path)));
  });

  it('lets the governing league read its own exception queue', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'matchOperationalExceptions/match_001_declared_score_mismatch'), {
        id: 'match_001_declared_score_mismatch',
        matchId: 'match_001',
        leagueId: 'league_001',
        code: 'declared_score_mismatch',
        blocking: true,
        status: 'open',
      });
    });

    // A case nobody can see is a case nobody resolves, which is why this one collection is
    // readable where the other seven are not.
    await assertSucceeds(
      getDoc(doc(asUser(LEAGUE_ADMIN), 'matchOperationalExceptions/match_001_declared_score_mismatch')),
    );
  });

  it('denies an unrelated user reading another league exception queue', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'matchOperationalExceptions/match_001_clock_anomaly'), {
        matchId: 'match_001',
        leagueId: 'league_001',
        code: 'clock_anomaly',
        status: 'open',
      });
    });

    await assertFails(getDoc(doc(asUser(OUTSIDER), 'matchOperationalExceptions/match_001_clock_anomaly')));
  });

  it('denies the league closing its own case from the client', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'matchOperationalExceptions/match_001_takeover_occurred'), {
        matchId: 'match_001',
        leagueId: 'league_001',
        code: 'takeover_occurred',
        status: 'open',
      });
    });

    // Resolution goes through a reviewed route that records who decided and why, and checks
    // conflict of interest first. A client write would skip all three.
    await assertFails(
      setDoc(
        doc(asUser(LEAGUE_ADMIN), 'matchOperationalExceptions/match_001_takeover_occurred'),
        { status: 'resolved' },
        { merge: true },
      ),
    );
  });
});

/**
 * The league table, and the rulings that move it.
 *
 * Both collections were added when standings became a server projection. They are the two
 * places a league table can be changed, so they are the two that must not be client-writable.
 *
 * `standings` existed before as an unmaintained seeded artifact that nothing read. It is now
 * the published table — rebuilt from the season's official results after every finalization —
 * which turns `write: if false` from incidental into load-bearing.
 */
describe('the published league table is server-owned', () => {
  async function seedTable() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'standings/season_001_team_a'), {
        id: 'season_001_team_a',
        leagueId: 'league_001',
        seasonId: 'season_001',
        sport: 'football',
        teamId: 'team_a',
        teamName: 'Kampala Stars',
        played: 8, wins: 6, draws: 2, losses: 0,
        pointsFor: 20, pointsAgainst: 7, difference: 13, points: 20, rank: 1,
      });
      await setDoc(doc(ctx.firestore(), 'pointsAdjustments/adjustment_001'), {
        id: 'adjustment_001',
        leagueId: 'league_001',
        seasonId: 'season_001',
        teamId: 'team_a',
        delta: -3,
        reason: 'Fielding a suspended player.',
        createdByUserId: 'user_league',
        createdAt: '2026-06-01T00:00:00.000Z',
      });
    });
  }

  it('is publicly readable, including to an anonymous visitor', async () => {
    await seedTable();
    // The whole point of the projection is that everyone sees the same table. An anonymous
    // visitor previously got the server's 240-match slice and a signed-in one the client's
    // 120-match slice, and past ~120 fixtures they disagreed.
    await assertSucceeds(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'standings/season_001_team_a'))
    );
  });

  it('denies a club rewriting its own row', async () => {
    await seedTable();
    await assertFails(
      setDoc(doc(asUser(TEAM_A_ADMIN), 'standings/season_001_team_a'), { points: 99 }, { merge: true })
    );
  });

  it('denies the governing league rewriting the table directly', async () => {
    await seedTable();
    // A league changes its table by ruling on a result or issuing an adjustment, both of
    // which are audited commands. Editing the projection would be changing the answer
    // without changing anything it is derived from — and the next recomputation would
    // silently revert it.
    await assertFails(
      setDoc(doc(asUser(LEAGUE_ADMIN), 'standings/season_001_team_a'), { points: 99 }, { merge: true })
    );
  });

  it('denies inventing a row for a club that is not in the league', async () => {
    await assertFails(
      setDoc(doc(asUser(TEAM_A_ADMIN), 'standings/season_001_team_forged'), {
        leagueId: 'league_001', seasonId: 'season_001', teamId: 'team_forged', points: 99, rank: 1,
      })
    );
  });

  it('denies deleting a row, which is how a club would remove a loss', async () => {
    await seedTable();
    await assertFails(deleteDoc(doc(asUser(TEAM_A_ADMIN), 'standings/season_001_team_a')));
    await assertFails(deleteDoc(doc(asUser(LEAGUE_ADMIN), 'standings/season_001_team_a')));
  });
});

describe('points adjustments are a ruling, not a client write', () => {
  async function seedAdjustment() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'pointsAdjustments/adjustment_001'), {
        id: 'adjustment_001',
        leagueId: 'league_001',
        seasonId: 'season_001',
        teamId: 'team_a',
        delta: -3,
        reason: 'Fielding a suspended player.',
        createdByUserId: 'user_league',
        createdAt: '2026-06-01T00:00:00.000Z',
      });
    });
  }

  it('is publicly readable, because the table footnotes it', async () => {
    await seedAdjustment();
    // A club docked six points is entitled to have the reason visible beside the
    // consequence, and a rival asked to accept the standings needs to see why.
    await assertSucceeds(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'pointsAdjustments/adjustment_001'))
    );
  });

  it('denies a club awarding itself points', async () => {
    await assertFails(
      setDoc(doc(asUser(TEAM_A_ADMIN), 'pointsAdjustments/forged'), {
        leagueId: 'league_001', seasonId: 'season_001', teamId: 'team_a',
        delta: 12, reason: 'A gift.', createdByUserId: TEAM_A_ADMIN,
      })
    );
  });

  it('denies a club docking a rival', async () => {
    await assertFails(
      setDoc(doc(asUser(TEAM_A_ADMIN), 'pointsAdjustments/forged_rival'), {
        leagueId: 'league_001', seasonId: 'season_001', teamId: 'team_b',
        delta: -12, reason: 'Sabotage.', createdByUserId: TEAM_A_ADMIN,
      })
    );
  });

  it('denies the governing league writing one directly', async () => {
    // A deduction changes a league table, so it goes through the same class of command as
    // every other decision that changes one: capability re-checked, reason required, audit
    // entry written. A direct write would skip all three.
    await assertFails(
      setDoc(doc(asUser(LEAGUE_ADMIN), 'pointsAdjustments/forged_by_league'), {
        leagueId: 'league_001', seasonId: 'season_001', teamId: 'team_a',
        delta: -6, reason: 'Discipline.', createdByUserId: LEAGUE_ADMIN,
      })
    );
  });

  it('denies rescinding one from a browser', async () => {
    await seedAdjustment();
    await assertFails(
      setDoc(doc(asUser(LEAGUE_ADMIN), 'pointsAdjustments/adjustment_001'), {
        rescindedAt: '2026-06-08T00:00:00.000Z',
      }, { merge: true })
    );
  });

  it('denies deleting one, so a ruling cannot be erased', async () => {
    await seedAdjustment();
    await assertFails(deleteDoc(doc(asUser(LEAGUE_ADMIN), 'pointsAdjustments/adjustment_001')));
  });
});

/**
 * The invited athlete's email address and claim token were published.
 *
 * They were written onto `athletes/{id}`, which is `allow read: if true` because a public
 * sporting profile has to be findable without an account. So the invited address, the token
 * hash, and an action URL carrying the CLEARTEXT claim token in its query string sat on a
 * document anyone could list anonymously.
 *
 * These now live in `athleteInvitations`, which nothing outside the server may read. There is
 * no client that needs to: the athlete follows a link they were emailed and the server
 * compares the token.
 */
describe('athlete invitations are not part of the public profile', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'athleteInvitations/athlete_001'), {
        athleteId: 'athlete_001',
        invitedEmail: 'invited.athlete@example.com',
        invitationTokenHash: 'a-hash-of-the-claim-token',
        invitationActionUrl: '/register?next=%2Fathletes%2Fathlete_001%3Fclaim%3Dcleartext',
        invitationExpiresAt: '2026-09-30T00:00:00.000Z',
      });
    });
  });

  it('cannot be read anonymously', () => assertFails(
    getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'athleteInvitations/athlete_001')),
  ));

  it('cannot be read by a signed-in user', () => assertFails(
    getDoc(doc(asUser('some_signed_in_user'), 'athleteInvitations/athlete_001')),
  ));

  it('cannot be read by the league that issued it', () => assertFails(
    getDoc(doc(asUser(LEAGUE_ADMIN), 'athleteInvitations/athlete_001')),
  ));

  it('cannot be written from a browser', () => assertFails(
    setDoc(doc(asUser(LEAGUE_ADMIN), 'athleteInvitations/athlete_002'), {
      athleteId: 'athlete_002', invitedEmail: 'x@example.com',
    }),
  ));

  it('leaves the public athlete profile readable, which is the point of separating them', () => assertSucceeds(
    getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'athletes/athlete_001')),
  ));
});


/**
 * Several browser-writable creates validated the fields that MATTER — ownership, a zeroed
 * counter, a starting status — and said nothing about the fields that do not exist. Firestore
 * accepts a document up to a megabyte, so an account that satisfied the ownership check could
 * attach an arbitrary payload to a public record, or pad a collection the platform review desk
 * reads until it costs real money to open. Authentication was never the gap; shape was.
 */
describe('a browser-created document may only carry the keys it is meant to', () => {
  const APPLICANT = 'user_applicant';

  function application(extra: Record<string, unknown> = {}) {
    return {
      id: 'application_shape',
      userId: APPLICANT,
      status: 'pending',
      applicantName: 'Aisha Nakato',
      applicantEmail: 'aisha@example.com',
      leagueName: 'Gulu Community League',
      sport: 'football',
      city: 'Gulu',
      evidenceNote: 'We run eight clubs across two districts.',
      ...extra,
    };
  }

  it('accepts an application with exactly the applicant fields', () => assertSucceeds(
    setDoc(doc(asUser(APPLICANT), 'leagueAdminApplications/application_shape'), application()),
  ));

  it('refuses a field the applicant invented', () => assertFails(
    setDoc(doc(asUser(APPLICANT), 'leagueAdminApplications/application_shape'),
      application({ arbitraryPayload: 'x'.repeat(500) })),
  ));

  it('refuses an applicant setting their own risk level', () => assertFails(
    // A reviewer writes this through the audited platform command. An applicant who could set
    // it on the way in could pre-declare themselves low risk.
    setDoc(doc(asUser(APPLICANT), 'leagueAdminApplications/application_shape'),
      application({ riskLevel: 'low' })),
  ));

  it('refuses an applicant attaching themselves to a league', () => assertFails(
    setDoc(doc(asUser(APPLICANT), 'leagueAdminApplications/application_shape'),
      application({ leagueId: 'league_001' })),
  ));

  it('refuses a free-text field used as a payload', () => assertFails(
    setDoc(doc(asUser(APPLICANT), 'leagueAdminApplications/application_shape'),
      application({ evidenceNote: 'x'.repeat(4001) })),
  ));

  it('still accepts a long but plausible evidence note', () => assertSucceeds(
    setDoc(doc(asUser(APPLICANT), 'leagueAdminApplications/application_shape'),
      application({ evidenceNote: 'x'.repeat(3999) })),
  ));

  it('still refuses an application submitted for somebody else', () => assertFails(
    // The check that was already there, kept honest: the shape rules must not have replaced it.
    setDoc(doc(asUser(APPLICANT), 'leagueAdminApplications/application_shape'),
      application({ userId: 'somebody_else' })),
  ));
});


/**
 * ADR-005 restores club operations. The line it has to hold: every club capability writes a
 * proposal or a piece of evidence, and none of them writes anything official.
 *
 * The specific trap is that `hasTeamOperatorCapability` lists the RETIRED V1 authority, and the
 * rules consulting it are the rules that guarded those workflows. Extending it would have
 * handed a Club Operator every surface the retired role had.
 */
describe('a Club Operator writes proposals and evidence, never the record', () => {
  const CLUB_USER = 'user_club_operator';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `accessIndex/team_team_a_${CLUB_USER}`),
        accessIndexDoc(CLUB_USER, 'team', 'team_a', [
          'team.profile.edit', 'team.roster.propose', 'team.content.publish',
          'team.media.manage', 'team.result.report', 'team.result.dispute',
        ]),
      );
    });
  });

  it('cannot write a match', () => assertFails(
    setDoc(doc(asUser(CLUB_USER), 'matches/match_001'), { score: { home: 9, away: 0 } }),
  ));

  it('cannot write a standings row', () => assertFails(
    setDoc(doc(asUser(CLUB_USER), 'standings/season_001_team_a'), { points: 99 }),
  ));

  it('cannot write a finalization', () => assertFails(
    setDoc(doc(asUser(CLUB_USER), 'finalizations/match_001'), { status: 'completed' }),
  ));

  it('cannot write a result case, so a ruling cannot be forged or its evidence removed', () => assertFails(
    setDoc(doc(asUser(CLUB_USER), 'resultCases/match_001__case1'), {
      matchId: 'match_001', status: 'resolved_corrected',
      ruling: { outcome: 'corrected', correctedScore: { home: 5, away: 0 } },
    }),
  ));

  it('cannot write an athlete registration', () => assertFails(
    // Roster is propose-only. A club that could write registration could manufacture
    // eligibility, which is the authority ADR-004 was right to take away.
    setDoc(doc(asUser(CLUB_USER), 'athletes/athlete_001'), { squadNumber: 7 }),
  ));

  it('does not inherit the retired V1 team authority', () => assertFails(
    // `team.result.submit` and `team.result.confirm` are the bilateral workflow. The new
    // capabilities must not reach the surfaces those guarded.
    setDoc(doc(asUser(CLUB_USER), 'resultSubmissions/match_001'), {
      matchId: 'match_001', status: 'official', homeScore: 3, awayScore: 0,
    }),
  ));

  it('can read a result case, because a correction that happened invisibly proves nothing', () => assertSucceeds(
    getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'resultCases/match_001__case1')),
  ));
});
