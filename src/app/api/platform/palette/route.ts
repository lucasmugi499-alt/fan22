import { adminDb } from '@/lib/firebase/admin';
import { resolveAccountClass } from '@/lib/auth/accountClass';
import { accessIndexId } from '@/lib/auth/access';
import { PLATFORM_COMMANDS } from '@/lib/platform/commandRegistry';
import {
  boundCommandPaletteItems,
  platformStaticPaletteItems,
  rankPlatformPalette,
  type PlatformPaletteItem,
  type PlatformPaletteKind,
} from '@/lib/platform/palette';
import { matchesAllWords, searchLookupToken } from '@/lib/search/searchTokens';
import { indexGrantsCapability } from '@/server/access/capabilities';
import { requireActivePrincipal, requireAuthenticatedUser, requireRole } from '@/server/api/security';

export const runtime = 'nodejs';

function adminHref(data: FirebaseFirestore.DocumentData) {
  const type = String(data.type ?? '');
  const id = String(data.entityId ?? '');
  if (type === 'league') return `/admin/network/leagues/${encodeURIComponent(id)}`;
  if (type === 'team') return `/admin/network/teams/${encodeURIComponent(id)}`;
  if (type === 'athlete') return `/admin/network/athletes/${encodeURIComponent(id)}`;
  if (type === 'person') return `/admin/network/people/${encodeURIComponent(id)}`;
  if (type === 'match') return `/admin/integrity/matches/${encodeURIComponent(id)}`;
  if (type === 'application') return `/admin/network/applications/${encodeURIComponent(id)}`;
  return '/admin/network';
}

function entityKind(value: unknown): PlatformPaletteKind | null {
  return value === 'league' || value === 'team' || value === 'athlete' || value === 'person'
    || value === 'match' || value === 'application' ? value : null;
}

function indexedEntity(data: FirebaseFirestore.DocumentData): PlatformPaletteItem | null {
  const kind = entityKind(data.type);
  const id = typeof data.entityId === 'string' ? data.entityId : null;
  const title = typeof data.title === 'string' ? data.title : null;
  if (!kind || !id || !title) return null;
  return {
    id: `${kind}-${id}`,
    kind,
    title,
    meta: typeof data.meta === 'string' ? data.meta : kind,
    href: adminHref(data),
    terms: String(data.searchText ?? `${title} ${data.meta ?? ''}`).split(/\s+/),
    targetId: id,
  };
}

function indexedCase(data: FirebaseFirestore.DocumentData, documentId: string): PlatformPaletteItem | null {
  const title = typeof data.title === 'string' ? data.title : null;
  const href = typeof data.href === 'string' && data.href.startsWith('/admin') ? data.href : '/admin';
  if (!title) return null;
  return {
    id: `case-${documentId}`,
    kind: 'case',
    title,
    meta: typeof data.meta === 'string' ? data.meta : 'Open case',
    href,
    terms: Array.isArray(data.searchTokens) ? data.searchTokens.map(String) : title.split(/\s+/),
    targetId: typeof data.targetId === 'string' ? data.targetId : documentId,
  };
}

/** Authenticated retrieval model for entities, cases, destinations, tabs, and commands. */
export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;
  const forbidden = requireRole(auth.actor, ['platform_admin', 'super_admin'], 'Platform Admin access required.');
  if (forbidden) return forbidden;
  const inactive = await requireActivePrincipal(auth.actor);
  if (inactive) return inactive;

  const [profile, access] = await Promise.all([
    adminDb.collection('users').doc(auth.actor.uid).get(),
    adminDb.collection('accessIndex').doc(accessIndexId('platform', 'global', auth.actor.uid)).get(),
  ]);
  const profileData = profile.data() ?? {};
  const accountClass = resolveAccountClass({
    accountClass: auth.actor.accountClass ?? profileData.accountClass,
    role: typeof auth.actor.role === 'string' ? auth.actor.role : profileData.role,
  });
  if (accountClass !== 'platform_operator') {
    return Response.json({ error: 'A dedicated Platform Operator account is required.' }, { status: 403 });
  }
  const accessData = access.data();
  if (!indexGrantsCapability(accessData, 'platform.audit.read')) {
    return Response.json({ error: 'Missing platform capability: platform.audit.read.' }, { status: 403 });
  }

  const authorizedCommands = PLATFORM_COMMANDS.filter((command) => indexGrantsCapability(accessData, command.capability));
  const query = new URL(request.url).searchParams.get('q')?.trim().slice(0, 100) ?? '';
  const token = searchLookupToken(query);
  const liveItems: PlatformPaletteItem[] = [];

  if (token) {
    const [entities, cases] = await Promise.all([
      adminDb.collection('searchIndex').where('tokens', 'array-contains', token).limit(100).get().catch(() => null),
      adminDb.collection('platformCaseIndex').where('searchTokens', 'array-contains', token).limit(60).get().catch(() => null),
    ]);
    for (const document of entities?.docs ?? []) {
      const data = document.data();
      if (!matchesAllWords(String(data.searchText ?? ''), query)) continue;
      const item = indexedEntity(data);
      if (item) liveItems.push(item);
    }
    for (const document of cases?.docs ?? []) {
      const data = document.data();
      if (!matchesAllWords(String(data.searchText ?? data.title ?? ''), query)) continue;
      const item = indexedCase(data, document.id);
      if (item) liveItems.push(item);
    }
  }

  /**
   * Commands are bound to the entities this query actually matched, so "kampala" offers
   * "Update league profile · Kampala Premier League" already pointed at that league rather
   * than a generic command the operator must then aim by hand. Binding uses only the
   * commands this principal is authorized for, so an unauthorized command cannot appear
   * merely because its entity matched.
   */
  const matchedEntities = rankPlatformPalette(
    liveItems.filter((item) => item.kind !== 'case'),
    query,
    3,
  );
  const results = rankPlatformPalette(
    [
      ...platformStaticPaletteItems(authorizedCommands),
      ...liveItems,
      ...boundCommandPaletteItems(matchedEntities, authorizedCommands),
    ],
    query,
  );
  return Response.json({ query, results }, { headers: { 'cache-control': 'private, no-store' } });
}
