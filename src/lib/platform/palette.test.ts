import { describe, expect, it } from 'vitest';
import {
  boundCommandPaletteItems,
  demoEntityPaletteItems,
  rankPlatformPalette,
  type PlatformPaletteItem,
} from './palette';

const ITEMS: PlatformPaletteItem[] = [
  { id: 'command-network.league.suspend', kind: 'command', title: 'Suspend league', meta: 'Consequential command', href: '/admin/network', terms: ['suspend', 'league', 'lifecycle'] },
  { id: 'league-suspend-youth', kind: 'league', title: 'Suspend Youth League', meta: 'Kampala · football', href: '/admin/network/leagues/league_1', terms: ['suspend', 'youth', 'league', 'kampala'] },
  { id: 'destination-network', kind: 'destination', title: 'Network', meta: 'Platform destination', href: '/admin/network', terms: ['network', 'league', 'team', 'athlete'] },
];

describe('platform palette ranking', () => {
  it('ranks an exact title above a prefix, then keeps stable ties', () => {
    expect(rankPlatformPalette(ITEMS, 'network').map((item) => item.id)).toEqual(['destination-network']);
    expect(rankPlatformPalette(ITEMS, 'suspend league').map((item) => item.id)).toEqual([
      'command-network.league.suspend',
      'league-suspend-youth',
    ]);
  });
});

describe('entity-bound commands', () => {
  const league: PlatformPaletteItem = {
    id: 'league-kampala', kind: 'league', title: 'Kampala Premier League',
    meta: 'football · Kampala', href: '/admin/network/leagues/league_1',
    terms: ['kampala', 'premier', 'league'], targetId: 'league_1',
  };

  it('binds each command to the entity and carries its id as the target', () => {
    const bound = boundCommandPaletteItems([league]);
    expect(bound.length).toBeGreaterThan(0);
    for (const item of bound) {
      expect(item.kind).toBe('command');
      expect(item.title).toContain('Kampala Premier League');
      expect(item.targetId).toBe('league_1');
      expect(item.href).toBe('/admin/network/leagues/league_1');
      expect(item.commandId).toBeTruthy();
    }
  });

  it('never offers a create command as if it applied to an existing entity', () => {
    const bound = boundCommandPaletteItems([league]);
    expect(bound.some((item) => item.commandId?.endsWith('.create'))).toBe(false);
  });

  it('binds only the commands the caller was authorized for', () => {
    expect(boundCommandPaletteItems([league], [])).toEqual([]);
  });

  it('skips entities with no target id, which cannot be aimed at', () => {
    expect(boundCommandPaletteItems([{ ...league, targetId: undefined }])).toEqual([]);
  });

  it('makes a bound command findable by the entity name the operator typed', () => {
    const bound = boundCommandPaletteItems([league]);
    expect(rankPlatformPalette(bound, 'kampala').length).toBeGreaterThan(0);
  });
});

describe('demo entity palette items', () => {
  it('produces findable admin rows for the seeded collections', () => {
    const items = demoEntityPaletteItems({
      leagues: [{ id: 'league_1', name: 'Kampala Premier League', sport: 'football', city: 'Kampala', status: 'active' }],
      teams: [{ id: 'team_1', name: 'Kampala United', sport: 'football', city: 'Kampala' }],
      athletes: [{ id: 'athlete_1', legalName: 'Emmanuel Okello', registeredPosition: 'Midfielder', sport: 'football' }],
      people: [{ uid: 'user_1', displayName: 'Jane K.', email: 'jane@example.test', role: 'league_admin' }],
    });
    expect(items.map((item) => item.kind)).toEqual(['league', 'team', 'athlete', 'person']);
    expect(items.every((item) => item.href.startsWith('/admin/network/'))).toBe(true);
    expect(items.every((item) => Boolean(item.targetId))).toBe(true);
    // Both titles start with the query, so the score ties and stable source order decides.
    expect(rankPlatformPalette(items, 'kampala').map((item) => item.title)).toEqual([
      'Kampala Premier League',
      'Kampala United',
    ]);
  });

  it('drops records with no displayable name rather than rendering a blank row', () => {
    expect(demoEntityPaletteItems({
      athletes: [{ id: 'athlete_2' }],
      people: [{ uid: 'user_2' }],
    })).toEqual([]);
  });
});
