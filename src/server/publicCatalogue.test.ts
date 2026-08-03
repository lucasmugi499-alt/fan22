import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminDb } from '@/lib/firebase/admin';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(),
  },
}));

const ORDERED_LIMIT_CALLS: Array<{ collection: string; field?: string; direction?: string }> = [];

function installFirestore(options: { fail?: boolean } = {}) {
  ORDERED_LIMIT_CALLS.length = 0;
  vi.mocked(adminDb.collection).mockImplementation((collectionName: string) => {
    const api = {
      orderBy: vi.fn((field: string, direction: string) => {
        ORDERED_LIMIT_CALLS.push({ collection: collectionName, field, direction });
        return api;
      }),
      limit: vi.fn(() => api),
      where: vi.fn(() => api),
      doc: vi.fn(() => ({ get: vi.fn(async () => ({ exists: false, data: () => undefined })) })),
      get: vi.fn(async () => {
        if (options.fail) throw new Error('Firestore unavailable');
        return { docs: [] };
      }),
    };
    return api as never;
  });
}

async function loadCatalogue() {
  vi.resetModules();
  return import('./publicCatalogue');
}

describe('public catalogue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'firebase');
    vi.stubEnv('NEXT_STATIC_EXPORT', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('orders "recent" collections by creation time instead of key order', async () => {
    installFirestore();
    vi.stubEnv('GOALPLACE_ENVIRONMENT', 'demo');
    const { getPublicLeagues } = await loadCatalogue();

    await getPublicLeagues();

    expect(ORDERED_LIMIT_CALLS).toContainEqual({
      collection: 'leagues',
      field: 'createdAt',
      direction: 'desc',
    });
  });

  it('falls back to the curated dataset in demo and discloses the source', async () => {
    installFirestore({ fail: true });
    vi.stubEnv('GOALPLACE_ENVIRONMENT', 'demo');
    vi.stubEnv('GOALPLACE_ALLOW_DEMO_LOGIN', 'true');
    const { getPublicLeagues } = await loadCatalogue();

    const { data, source } = await getPublicLeagues();

    expect(data.length).toBeGreaterThan(0);
    expect(source).toBe('curated_preview');
  });

  it('reports a live source when no fallback occurred', async () => {
    installFirestore();
    vi.stubEnv('GOALPLACE_ENVIRONMENT', 'demo');
    vi.stubEnv('GOALPLACE_ALLOW_DEMO_LOGIN', 'true');
    const { getPublicLeagues } = await loadCatalogue();

    const { source } = await getPublicLeagues();

    expect(source).toBe('live');
  });

  it.each(['beta', 'production'])(
    'never substitutes synthetic data in %s, even with demo login enabled',
    async (environment) => {
      installFirestore({ fail: true });
      vi.stubEnv('GOALPLACE_ENVIRONMENT', environment);
      // Demo login being switched on must not unlock synthetic fallback outside demo:
      // real league operators would silently be shown records of competitions that
      // never happened.
      vi.stubEnv('GOALPLACE_ALLOW_DEMO_LOGIN', 'true');
      const { getPublicLeagues } = await loadCatalogue();

      await expect(getPublicLeagues()).rejects.toThrow('Firestore unavailable');
    },
  );
});
