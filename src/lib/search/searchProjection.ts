import { buildSearchTokens, normalizeSearchText } from './searchTokens';

/**
 * The single definition of how an entity becomes a search index entry.
 *
 * Shared by the bulk index builder and the Firestore triggers that keep the index fresh.
 * Two implementations would drift, and a drifted search index is invisible: entries would
 * simply stop matching, with nothing failing.
 *
 * Entries carry only fields already public on the entity's own page.
 */

export type SearchEntityType = 'athlete' | 'team' | 'league' | 'season';

export type SearchIndexEntry = {
  id: string;
  type: SearchEntityType;
  entityId: string;
  title: string;
  meta: string;
  href: string;
  searchText: string;
  tokens: string[];
};

export function searchIndexEntryId(type: SearchEntityType, entityId: string) {
  return `${type}_${entityId}`;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function metaLine(parts: Array<string>) {
  return parts.filter((part) => part.trim().length > 0).join(' / ');
}

/**
 * Returns the index entry for an entity, or `null` when it has nothing searchable.
 *
 * A null result means any existing entry should be deleted: an entity that loses its
 * name must stop being findable rather than linger under its old one.
 */
export function projectSearchEntry(
  type: SearchEntityType,
  entityId: string,
  data: Record<string, unknown>,
): SearchIndexEntry | null {
  const title = text(data.name).trim();
  if (!title) return null;

  const extras: Record<SearchEntityType, string[]> = {
    athlete: [text(data.position), text(data.city), text(data.sport), text(data.teamName)],
    team: [text(data.city), text(data.sport)],
    league: [text(data.city), text(data.sport), text(data.season)],
    season: [text(data.sport)],
  };

  const meta: Record<SearchEntityType, string> = {
    athlete: metaLine(['Athlete', text(data.position), text(data.city)]),
    team: metaLine(['Team', text(data.city), text(data.sport)]),
    league: metaLine(['League', text(data.city), text(data.sport)]),
    season: metaLine(['Season', text(data.sport)]),
  };

  const href: Record<SearchEntityType, string> = {
    athlete: `/athletes/${entityId}`,
    team: `/teams/${entityId}`,
    league: `/leagues/${entityId}`,
    season: `/leagues/${text(data.leagueId)}`,
  };

  const tokens = buildSearchTokens(title, ...extras[type]);
  if (!tokens.length) return null;

  return {
    id: searchIndexEntryId(type, entityId),
    type,
    entityId,
    title,
    meta: meta[type],
    href: href[type],
    searchText: normalizeSearchText([title, ...extras[type]].filter(Boolean).join(' ')),
    tokens,
  };
}
