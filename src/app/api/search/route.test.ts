import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminDb } from '@/lib/firebase/admin';
import { buildSearchTokens, normalizeSearchText } from '@/lib/search/searchTokens';
import { GET } from './route';

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: vi.fn(), runTransaction: vi.fn() },
}));

function request(query: string, type?: string) {
  const url = new URL('https://goalplace256.test/api/search');
  url.searchParams.set('q', query);
  if (type) url.searchParams.set('type', type);
  return new Request(url);
}

function entry(type: string, entityId: string, title: string, extra: string[] = []) {
  return {
    type,
    entityId,
    title,
    meta: `${type} / meta`,
    href: `/${type}s/${entityId}`,
    searchText: normalizeSearchText([title, ...extra].join(' ')),
    tokens: buildSearchTokens(title, ...extra),
  };
}

const INDEX = [
  entry('athlete', 'a1', 'Priscilla Nakato', ['Striker', 'Kampala']),
  entry('athlete', 'a2', 'Prisca Aber', ['Goalkeeper', 'Gulu']),
  entry('team', 't1', 'Kisenyi United', ['Kampala', 'football']),
  entry('team', 't2', 'Kampala Warriors', ['Kampala', 'football']),
];

function install(records = INDEX) {
  vi.mocked(adminDb.collection).mockImplementation((name: string) => {
    if (name === 'apiRateLimits') {
      return { doc: () => ({ path: 'apiRateLimits/x' }) } as never;
    }
    const state = { token: '', type: '' };
    const api = {
      where: vi.fn((field: string, _operator: string, value: string) => {
        if (field === 'tokens') state.token = value;
        if (field === 'type') state.type = value;
        return api;
      }),
      limit: vi.fn(() => api),
      get: vi.fn(async () => ({
        docs: records
          .filter((record) => record.tokens.includes(state.token))
          .filter((record) => !state.type || record.type === state.type)
          .map((record) => ({ data: () => record })),
      })),
    };
    return api as never;
  });

  vi.mocked(adminDb.runTransaction).mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
    get: async () => ({ exists: false, data: () => undefined }),
    set: vi.fn(),
  }) as never);
}

describe('public search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    install();
  });

  it('finds an athlete by surname, not only by first name', async () => {
    const body = await (await GET(request('nakato'))).json();

    // The old client-side search could only match whichever 60 records happened to load.
    expect(body.results.map((result: { entityId: string }) => result.entityId)).toEqual(['a1']);
  });

  it('narrows multi-word queries instead of returning every partial match', async () => {
    const broad = await (await GET(request('kampala'))).json();
    const narrow = await (await GET(request('kampala warriors'))).json();

    expect(broad.results.length).toBeGreaterThan(1);
    expect(narrow.results.map((result: { entityId: string }) => result.entityId)).toEqual(['t2']);
  });

  it('matches a shared prefix across several records', async () => {
    const body = await (await GET(request('pris'))).json();

    expect(body.results).toHaveLength(2);
  });

  it('filters by entity type when asked', async () => {
    const body = await (await GET(request('kampala', 'team'))).json();

    expect(body.results.every((result: { type: string }) => result.type === 'team')).toBe(true);
  });

  it('returns nothing for a query too short to be meaningful', async () => {
    const body = await (await GET(request('a'))).json();

    expect(body.results).toEqual([]);
    // A single character must not trigger an index read at all.
    expect(adminDb.collection).not.toHaveBeenCalledWith('searchIndex');
  });

  it('exposes only public projection fields', async () => {
    const body = await (await GET(request('nakato'))).json();

    // The index carries tokens and normalized text for matching; neither is anyone's
    // business outside the server.
    expect(Object.keys(body.results[0]).sort()).toEqual(['entityId', 'href', 'meta', 'title', 'type']);
  });
});
