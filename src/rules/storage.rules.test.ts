import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';

const PROJECT_ID = 'goalplace256-rules-test';
const BUCKET_URL = `gs://${PROJECT_ID}.appspot.com`;
const RULES_FILE = process.env.STORAGE_RULES_FILE ?? 'storage.rules';

let testEnv: RulesTestEnvironment;

function bytes(size: number) {
  return new Uint8Array(size);
}

function metadata(
  contentType: string,
  customMetadata: Record<string, string> = {},
) {
  return { contentType, customMetadata };
}

function storageFor(uid?: string, claims: Record<string, unknown> = {}) {
  const ctx = uid
    ? testEnv.authenticatedContext(uid, claims)
    : testEnv.unauthenticatedContext();
  return ctx.storage(BUCKET_URL);
}

function ref(uid: string | undefined, path: string, claims: Record<string, unknown> = {}) {
  return storageFor(uid, claims).ref(path);
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      rules: readFileSync(RULES_FILE, 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearStorage();
});

describe('public media upload boundary', () => {
  it('lets signed-in users publish scoped public media with matching immutable ownership metadata', async () => {
    await assertSucceeds(
      ref('user_a', 'public/teams/team_a/user_a/badge.jpg').put(
        bytes(128),
        metadata('image/jpeg', {
          ownerType: 'teams',
          ownerId: 'team_a',
          uploadedBy: 'user_a',
        }),
      ),
    );
  });

  it('refuses legacy broad public uploads outside entity-scoped paths', async () => {
    await assertFails(
      ref('user_a', 'public/random/badge.jpg').put(
        bytes(128),
        metadata('image/jpeg', {
          ownerType: 'teams',
          ownerId: 'team_a',
          uploadedBy: 'user_a',
        }),
      ),
    );
  });

  it('refuses public uploads when metadata does not match the path and caller', async () => {
    await assertFails(
      ref('user_a', 'public/teams/team_a/user_a/badge.jpg').put(
        bytes(128),
        metadata('image/jpeg', {
          ownerType: 'teams',
          ownerId: 'team_b',
          uploadedBy: 'user_a',
        }),
      ),
    );

    await assertFails(
      ref('user_a', 'public/teams/team_a/user_a/badge.jpg').put(
        bytes(128),
        metadata('image/jpeg', {
          ownerType: 'teams',
          ownerId: 'team_a',
          uploadedBy: 'user_b',
        }),
      ),
    );
  });

  it('refuses unauthenticated public uploads and non-media content', async () => {
    await assertFails(
      ref(undefined, 'public/teams/team_a/user_a/badge.jpg').put(
        bytes(128),
        metadata('image/jpeg', {
          ownerType: 'teams',
          ownerId: 'team_a',
          uploadedBy: 'user_a',
        }),
      ),
    );

    await assertFails(
      ref('user_a', 'public/teams/team_a/user_a/script.txt').put(
        bytes(128),
        metadata('text/plain', {
          ownerType: 'teams',
          ownerId: 'team_a',
          uploadedBy: 'user_a',
        }),
      ),
    );
  });
});

describe('match evidence boundary', () => {
  it('lets the uploader create match evidence but not replace or delete it', async () => {
    const evidence = ref('team_admin', 'matchEvidence/match_1/team_a/team_admin/evidence.jpg');

    await assertSucceeds(evidence.put(bytes(128), metadata('image/jpeg')));
    await assertFails(evidence.put(bytes(128), metadata('image/jpeg')));
    await assertFails(evidence.delete());
  });

  it('caps match evidence below the general public media size ceiling', async () => {
    await assertFails(
      ref('team_admin', 'matchEvidence/match_1/team_a/team_admin/large.jpg').put(
        bytes(16 * 1024 * 1024),
        metadata('image/jpeg'),
      ),
    );
  });

  it('lets platform admins remove match evidence', async () => {
    const path = 'matchEvidence/match_1/team_a/team_admin/evidence-admin.jpg';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage(BUCKET_URL).ref(path).put(bytes(128), metadata('image/jpeg'));
    });

    await assertSucceeds(ref('platform_admin', path, { role: 'platform_admin' }).delete());
  });
});

describe('private and approved media boundaries', () => {
  it('keeps user media private to its owner and platform admins', async () => {
    const path = 'users/user_a/avatar.jpg';
    await assertSucceeds(ref('user_a', path).put(bytes(128), metadata('image/jpeg')));

    await assertSucceeds(ref('user_a', path).getMetadata());
    await assertSucceeds(ref('platform_admin', path, { role: 'platform_admin' }).getMetadata());
    await assertFails(ref('user_b', path).getMetadata());
    await assertFails(ref(undefined, path).getMetadata());
  });

  it('allows public reads of admin-approved media but only admins can write it', async () => {
    const path = 'approvedMedia/leagues/league_1/banner.jpg';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage(BUCKET_URL).ref(path).put(bytes(128), metadata('image/jpeg'));
    });

    await assertSucceeds(ref(undefined, path).getMetadata());
    await assertFails(ref('user_a', 'approvedMedia/leagues/league_1/other.jpg').put(bytes(128), metadata('image/jpeg')));
    await assertSucceeds(
      ref('platform_admin', 'approvedMedia/leagues/league_1/other.jpg', { role: 'platform_admin' }).put(
        bytes(128),
        metadata('image/jpeg'),
      ),
    );
  });
});

describe('storage catch-all boundary', () => {
  it('does not let Super Admin browser clients write arbitrary objects through the fallback rule', async () => {
    const path = 'serverOnlyExports/payment-ledger.csv';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage(BUCKET_URL).ref(path).put(bytes(128), metadata('text/csv'));
    });

    await assertSucceeds(ref('super_admin', path, { role: 'super_admin' }).getMetadata());
    await assertFails(
      ref('super_admin', 'serverOnlyExports/forged.csv', { role: 'super_admin' }).put(
        bytes(128),
        metadata('text/csv'),
      ),
    );
    await assertFails(ref('super_admin', path, { role: 'super_admin' }).delete());
  });
});
