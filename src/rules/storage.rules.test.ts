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
  it('refuses direct browser writes to entity public media paths', async () => {
    await assertFails(
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
  it('blocks direct browser creation, replacement and uploader deletion for match evidence', async () => {
    const evidence = ref('team_admin', 'matchEvidence/match_1/team_a/team_admin/evidence.jpg');

    await assertFails(evidence.put(bytes(128), metadata('image/jpeg')));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage(BUCKET_URL).ref('matchEvidence/match_1/team_a/team_admin/evidence.jpg').put(bytes(128), metadata('image/jpeg'));
    });
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

  it('lets nobody delete match evidence from a browser, platform admins included', async () => {
    /**
     * B3. This test asserted the opposite until 2026-08-24, and inverting it is the point.
     *
     * Match evidence is the provenance behind a disputed result. Uploads were closed and
     * deletes were not, so a compromised Platform Admin session could destroy the
     * photographs explaining a decision — bypassing the media command, its reason and its
     * audit trail, and leaving Firestore metadata pointing at an object that no longer
     * exists. Several builds were spent removing browser deletion of immutable sporting
     * history from Firestore; the evidence behind that history meets the same standard.
     *
     * Lawful removal runs as a server command that records a reason and preserves a hash.
     */
    const path = 'matchEvidence/match_1/team_a/team_admin/evidence-admin.jpg';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage(BUCKET_URL).ref(path).put(bytes(128), metadata('image/jpeg'));
    });

    await assertFails(ref('platform_admin', path, { role: 'platform_admin' }).delete());
    await assertFails(ref('team_admin', path).delete());
    // Reading it is still how a dispute gets reviewed.
    await assertSucceeds(ref('platform_admin', path, { role: 'platform_admin' }).getMetadata());
  });

  it('lets nobody delete published or public media from a browser', async () => {
    // Deleting the object without retiring the record leaves metadata pointing at nothing —
    // the desynchronisation the governed media lifecycle exists to prevent.
    const published = 'publishedMedia/team/team_1/user_a/photo.jpg';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage(BUCKET_URL).ref(published).put(bytes(128), metadata('image/jpeg'));
    });
    await assertFails(ref('user_a', published).delete());
    await assertFails(ref('platform_admin', published, { role: 'platform_admin' }).delete());
  });

  it('keeps match evidence reads scoped to the uploader and platform admins', async () => {
    const path = 'matchEvidence/match_1/team_a/team_admin/private-evidence.jpg';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage(BUCKET_URL).ref(path).put(bytes(128), metadata('image/jpeg'));
    });

    await assertSucceeds(ref('team_admin', path).getMetadata());
    await assertSucceeds(ref('platform_admin', path, { role: 'platform_admin' }).getMetadata());
    await assertFails(ref('other_user', path).getMetadata());
    await assertFails(ref(undefined, path).getMetadata());
  });
});

describe('private and approved media boundaries', () => {
  it('keeps user media private to its owner and platform admins', async () => {
    const path = 'users/user_a/avatar.jpg';
    // Direct browser upload is closed as of 2026-08-23: every upload goes through a signed
    // session so it carries a quota, a one-time authorization, a hash and a media record.
    await assertFails(ref('user_a', path).put(bytes(128), metadata('image/jpeg')));

    // Seeded the way the governed pipeline writes it — through the Admin SDK, which these
    // rules do not apply to — so the read boundary is still exercised on a real object.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage(BUCKET_URL).ref(path).put(bytes(128), metadata('image/jpeg'));
    });

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
    await assertFails(ref('user_a', 'publishedMedia/team/team_1/user_a/other.jpg').put(bytes(128), metadata('image/jpeg')));
    await assertFails(ref('user_a', 'approvedMedia/leagues/league_1/other.jpg').put(bytes(128), metadata('image/jpeg')));
    // Admin browser writes are closed: publishing without a moderation command record is a
    // decision nobody can review. The Admin SDK is not subject to these rules, so the
    // governed pipeline still publishes.
    await assertFails(
      ref('platform_admin', path, { role: 'platform_admin' }).put(bytes(128), metadata('image/jpeg')),
    );
  });
});

describe('storage catch-all boundary', () => {
  it('does not let Super Admin browser clients write arbitrary objects through the fallback rule', async () => {
    const path = 'serverOnlyExports/payment-ledger.csv';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage(BUCKET_URL).ref(path).put(bytes(128), metadata('text/csv'));
    });

    // Read is denied now too. Storage holds match evidence and identity documents, and a
    // role-shaped blanket read is a hole no specific rule can close.
    await assertFails(ref('super_admin', path, { role: 'super_admin' }).getMetadata());
    await assertFails(
      ref('super_admin', 'serverOnlyExports/forged.csv', { role: 'super_admin' }).put(
        bytes(128),
        metadata('text/csv'),
      ),
    );
    await assertFails(ref('super_admin', path, { role: 'super_admin' }).delete());
  });
});
