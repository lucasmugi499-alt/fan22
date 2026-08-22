import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { hasCapability } from '@/server/access/capabilities';
import { requireAuthenticatedMutation, requireAuthenticatedUser, requireRole } from '@/server/api/security';
import { platformAuditEvent, refuse, securePlatformCommand } from '@/server/platform/commands/securePlatformCommand';
import { readSiteSettings, siteSettingsRef } from '@/server/platform/siteSettingsStore';
import {
  applySiteSettingsPatch,
  changedSettingKeys,
  maintenanceBannerProblem,
  siteSettingsPatchSchema,
} from '@/lib/platform/siteSettings';

export const runtime = 'nodejs';

/**
 * Website and settings.
 *
 * Everything reachable here is reversible and publicly visible within a minute, which is the
 * test for whether something belongs on a settings page at all. The switches that fail that
 * test — traffic routing, real payments, finalizer mode, environment activation — are not
 * refused by this route so much as unreachable from it: `siteSettingsPatchSchema` is strict,
 * so naming one is a validation error rather than a silently ignored key.
 *
 * Writes are still audited. "Reversible" is not "unimportant": closing registration or
 * hiding support campaigns changes what the public can do, and someone should be able to ask
 * later who did it and why.
 */
export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;
  const forbidden = requireRole(auth.actor, ['platform_admin', 'super_admin'], 'Platform Admin access required.');
  if (forbidden) return forbidden;
  if (!(await hasCapability(auth.actor.uid, { scopeType: 'platform', scopeId: 'global' }, 'platform.audit.read'))) {
    return Response.json({ error: 'Missing platform capability: platform.audit.read.' }, { status: 403 });
  }
  return Response.json(await readSiteSettings(), { headers: { 'cache-control': 'no-store' } });
}

const bodySchema = z.object({
  reason: z.string().trim().min(4).max(500),
  /**
   * The version the operator was looking at when they made the change.
   *
   * Two operators with the settings page open would otherwise silently overwrite each
   * other — the second save would carry the first's stale values for every field it did not
   * touch, quietly reverting them.
   */
  expectedVersion: z.number().int().min(0),
  patch: siteSettingsPatchSchema,
});

export async function POST(request: Request) {
  const guarded = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 8 * 1024,
    invalidBodyError: 'A settings patch is required. Governed switches cannot be set here.',
    rateLimit: { bucket: 'platform_site_settings', limit: 40, windowSeconds: 300 },
  });
  if ('response' in guarded) return guarded.response;

  const outcome = await securePlatformCommand({
    actor: guarded.actor,
    command: 'site.updateSettings',
    requiredCapability: 'platform.site.manage',
    requireReason: true,
    reason: guarded.data.reason,
    handler: async ({ actor, requestId, reason }) => {
      const current = await readSiteSettings();
      if (current.version !== guarded.data.expectedVersion) {
        refuse(
          `These settings changed while you were editing (now version ${current.version}). Reload and reapply your change.`,
          409,
        );
      }

      const changed = changedSettingKeys(current, guarded.data.patch);
      if (!changed.length) refuse('Nothing to change.');

      const next = applySiteSettingsPatch(current, guarded.data.patch, actor.uid, new Date().toISOString());

      const bannerProblem = maintenanceBannerProblem(next.maintenanceBanner);
      if (bannerProblem) refuse(bannerProblem);

      await siteSettingsRef().set(next, { merge: false });
      await adminDb.collection('adminAuditEvents').add({
        ...platformAuditEvent({
          actor,
          requestId,
          action: 'platform.site.updateSettings',
          targetCollection: 'platformSettings',
          targetId: 'site',
          note: reason,
          beforeSummary: Object.fromEntries(changed.map((key) => [key, current[key as keyof typeof current] ?? null])),
          afterSummary: Object.fromEntries(changed.map((key) => [key, next[key as keyof typeof next] ?? null])),
        }),
        createdAt: FieldValue.serverTimestamp(),
      });

      return { version: next.version, changed };
    },
  });

  if ('response' in outcome) return outcome.response;
  return Response.json({ ok: true, ...outcome.result });
}
