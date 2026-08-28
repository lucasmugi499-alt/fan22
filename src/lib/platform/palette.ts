import { PLATFORM_COMMANDS, type PlatformCommandDefinition } from './commandRegistry';

export type PlatformPaletteKind =
  | 'destination'
  | 'tab'
  | 'command'
  | 'league'
  | 'team'
  | 'athlete'
  | 'person'
  | 'match'
  | 'case'
  | 'application';

export type PlatformPaletteItem = {
  id: string;
  kind: PlatformPaletteKind;
  title: string;
  meta: string;
  href: string;
  terms: string[];
  commandId?: string;
  targetId?: string;
  tier?: PlatformCommandDefinition['tier'];
};

const DESTINATIONS: PlatformPaletteItem[] = [
  { id: 'destination-desk', kind: 'destination', title: 'Desk', meta: 'Platform destination', href: '/admin', terms: ['desk', 'cases', 'work', 'decisions'] },
  { id: 'destination-network', kind: 'destination', title: 'Network', meta: 'Platform destination', href: '/admin/network', terms: ['network', 'league', 'team', 'athlete', 'people', 'access', 'application'] },
  { id: 'destination-integrity', kind: 'destination', title: 'Integrity', meta: 'Platform destination', href: '/admin/integrity', terms: ['integrity', 'live', 'quality', 'trust', 'audit', 'exception'] },
  { id: 'destination-money', kind: 'destination', title: 'Money', meta: 'Platform destination', href: '/admin/money', terms: ['money', 'allocation', 'payee', 'hold', 'sponsor', 'report'] },
  { id: 'destination-platform', kind: 'destination', title: 'Platform', meta: 'Platform destination', href: '/admin/platform', terms: ['platform', 'site', 'controls', 'health', 'activation'] },
];

const TAB_GROUPS: Array<{ destination: string; base: string; tabs: string[] }> = [
  { destination: 'Desk', base: '/admin', tabs: ['all', 'mine', 'applications', 'integrity', 'trust', 'money', 'history'] },
  { destination: 'Network', base: '/admin/network', tabs: ['leagues', 'teams', 'athletes', 'organizations', 'people', 'access', 'applications'] },
  { destination: 'Integrity', base: '/admin/integrity', tabs: ['live', 'escalations', 'quality', 'trust', 'audit'] },
  { destination: 'Money', base: '/admin/money', tabs: ['allocations', 'payees', 'holds', 'sponsors', 'reports'] },
  { destination: 'Platform', base: '/admin/platform', tabs: ['site', 'controls', 'health', 'activations', 'audit'] },
];

const TABS: PlatformPaletteItem[] = TAB_GROUPS.flatMap(({ destination, base, tabs }) => tabs.map((tab) => ({
  id: `tab-${destination.toLowerCase()}-${tab}`,
  kind: 'tab' as const,
  title: `${destination} · ${tab[0].toUpperCase()}${tab.slice(1)}`,
  meta: 'Workspace tab',
  href: `${base}?tab=${tab}`,
  terms: [destination.toLowerCase(), tab],
})));

export function commandPaletteItems(commands: readonly PlatformCommandDefinition[] = PLATFORM_COMMANDS): PlatformPaletteItem[] {
  return commands.map((command) => ({
    id: `command-${command.id}`,
    kind: 'command',
    title: command.label,
    meta: `${command.tier[0].toUpperCase()}${command.tier.slice(1)} command`,
    href: command.destination,
    terms: [command.id, command.entity, command.description, ...command.keywords],
    commandId: command.id,
    tier: command.tier,
  }));
}

export function platformStaticPaletteItems(commands?: readonly PlatformCommandDefinition[]) {
  return [...DESTINATIONS, ...TABS, ...commandPaletteItems(commands)];
}

function normalizedWords(value: string) {
  return value.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

function score(item: PlatformPaletteItem, query: string) {
  const normalized = query.toLowerCase().trim();
  if (!normalized) return item.kind === 'destination' ? 30 : item.kind === 'command' ? 20 : item.kind === 'tab' ? 10 : 1;
  const words = normalizedWords(normalized);
  const title = item.title.toLowerCase();
  const haystack = `${title} ${item.meta} ${item.terms.join(' ')}`.toLowerCase();
  if (!words.every((word) => haystack.includes(word))) return -1;
  let value = words.reduce((sum, word) => sum + (title.includes(word) ? 12 : 4), 0);
  if (title === normalized) value += 120;
  else if (title.startsWith(normalized)) value += 80;
  else if (title.includes(normalized)) value += 45;
  if (item.kind === 'command') value += 5;
  return value;
}

export function rankPlatformPalette(items: readonly PlatformPaletteItem[], query: string, limit = 32) {
  return items
    .map((item, index) => ({ item, index, score: score(item, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map(({ item }) => item);
}

/**
 * Commands, bound to a concrete entity the operator just typed.
 *
 * The palette's value is not that it lists commands; it is that "kampala" produces
 * "Update league profile · Kampala Premier League" already pointed at that league. An
 * unbound command list makes the operator find the entity a second time, which is the
 * directory round trip the console exists to remove.
 *
 * `.create` commands are excluded because they have no existing target to bind to, and a
 * "Create league · Kampala Premier League" row would be a lie about what it does.
 */
export function boundCommandPaletteItems(
  entities: readonly PlatformPaletteItem[],
  commands: readonly PlatformCommandDefinition[] = PLATFORM_COMMANDS,
  perEntityLimit = 4,
): PlatformPaletteItem[] {
  const items: PlatformPaletteItem[] = [];
  for (const entity of entities) {
    if (!entity.targetId) continue;
    const bindable = commands
      .filter((command) => command.entity === entity.kind && !command.id.endsWith('.create'))
      .slice(0, perEntityLimit);
    for (const command of bindable) {
      items.push({
        id: `command-${command.id}-${entity.targetId}`,
        kind: 'command',
        title: `${command.label} · ${entity.title}`,
        meta: `${command.tier[0].toUpperCase()}${command.tier.slice(1)} command`,
        href: entity.href,
        terms: [command.id, command.entity, command.description, ...command.keywords, ...entity.terms],
        commandId: command.id,
        targetId: entity.targetId,
        tier: command.tier,
      });
    }
  }
  return items;
}

type DemoEntitySource = {
  leagues?: ReadonlyArray<{ id: string; name: string; sport?: unknown; city?: string; status?: string }>;
  teams?: ReadonlyArray<{ id: string; name: string; leagueId?: string; city?: string; sport?: unknown }>;
  athletes?: ReadonlyArray<{ id: string; legalName?: string; name?: string; registeredPosition?: string; sport?: unknown }>;
  people?: ReadonlyArray<{ uid?: string; id?: string; displayName?: string; email?: string; role?: string }>;
};

/**
 * Entity rows for the palette when the console is running on the seeded demo dataset.
 *
 * Demo mode has no `searchIndex` collection, and without this the palette answered
 * "No matching records" for every league on the screen behind it. The demo is where the
 * console is shown to people, so a palette that cannot find a league there is not a
 * degraded demo; it is a broken feature in the only place anyone looks at it.
 */
export function demoEntityPaletteItems(source: DemoEntitySource): PlatformPaletteItem[] {
  const items: PlatformPaletteItem[] = [];
  for (const league of source.leagues ?? []) {
    items.push({
      id: `league-${league.id}`,
      kind: 'league',
      title: league.name,
      meta: [league.sport, league.city, league.status].filter(Boolean).join(' · ') || 'League',
      href: `/admin/network/leagues/${encodeURIComponent(league.id)}`,
      terms: [league.name, String(league.sport ?? ''), league.city ?? '', 'league'].filter(Boolean),
      targetId: league.id,
    });
  }
  for (const team of source.teams ?? []) {
    items.push({
      id: `team-${team.id}`,
      kind: 'team',
      title: team.name,
      meta: [team.sport, team.city].filter(Boolean).join(' · ') || 'Team',
      href: `/admin/network/teams/${encodeURIComponent(team.id)}`,
      terms: [team.name, String(team.sport ?? ''), team.city ?? '', 'team'].filter(Boolean),
      targetId: team.id,
    });
  }
  for (const athlete of source.athletes ?? []) {
    const title = athlete.legalName ?? athlete.name;
    if (!title) continue;
    items.push({
      id: `athlete-${athlete.id}`,
      kind: 'athlete',
      title,
      meta: [athlete.registeredPosition, athlete.sport].filter(Boolean).join(' · ') || 'Athlete',
      href: `/admin/network/athletes/${encodeURIComponent(athlete.id)}`,
      terms: [title, athlete.registeredPosition ?? '', String(athlete.sport ?? ''), 'athlete'].filter(Boolean),
      targetId: athlete.id,
    });
  }
  for (const person of source.people ?? []) {
    const id = person.uid ?? person.id;
    const title = person.displayName ?? person.email;
    if (!id || !title) continue;
    items.push({
      id: `person-${id}`,
      kind: 'person',
      title,
      meta: [person.role, person.email].filter(Boolean).join(' · ') || 'Person',
      href: `/admin/network/people/${encodeURIComponent(id)}`,
      terms: [title, person.email ?? '', person.role ?? '', 'person', 'account'].filter(Boolean),
      targetId: id,
    });
  }
  return items;
}
