import type { Firestore } from 'firebase-admin/firestore';
import {
  projectSearchEntry,
  searchIndexEntryId,
  type SearchEntityType,
} from '../../src/lib/search/searchProjection';

/**
 * Keeps the public search index in step with the entities it describes.
 *
 * The index is a projection, and a stale projection is invisible: a newly created
 * athlete simply would not appear in search, with nothing failing and no error to
 * notice. Rebuilding on a schedule alone would leave that window open for the length of
 * the schedule.
 *
 * The per-entity shape comes from the shared projector, so an incremental update here
 * and a full rebuild from the script can never disagree.
 */

export type SearchIndexOutcome = 'written' | 'deleted' | 'unchanged';

/**
 * Applies one entity change to the index.
 *
 * Deleting the entity, or removing the field that makes it searchable, removes the
 * entry — an entity that loses its name must stop being findable rather than linger
 * under the old one.
 */
export async function applySearchIndexChange(
  db: Firestore,
  type: SearchEntityType,
  entityId: string,
  after: Record<string, unknown> | undefined,
): Promise<SearchIndexOutcome> {
  const entryRef = db.collection('searchIndex').doc(searchIndexEntryId(type, entityId));
  const entry = after ? projectSearchEntry(type, entityId, after) : null;

  if (!entry) {
    const existing = await entryRef.get();
    if (!existing.exists) return 'unchanged';
    await entryRef.delete();
    return 'deleted';
  }

  // Tokens are the expensive part of the document; skip the write when nothing a
  // searcher could match on has changed.
  const existing = await entryRef.get();
  const current = existing.data();
  if (
    current
    && current.title === entry.title
    && current.meta === entry.meta
    && current.href === entry.href
    && current.searchText === entry.searchText
  ) {
    return 'unchanged';
  }

  await entryRef.set(entry);
  return 'written';
}
