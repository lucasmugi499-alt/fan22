import 'server-only';
import { adminDb } from '@/lib/firebase/admin';
import { DEFAULT_SITE_SETTINGS, type SiteSettings } from '@/lib/platform/siteSettings';

/**
 * Where site settings live, and what happens when they do not.
 *
 * A missing document is a normal state, not an error: on a fresh environment nobody has
 * saved settings yet. Reading returns the defaults rather than throwing, because the public
 * site asks this question on every render and a first deploy must not be a blank page.
 *
 * The defaults are deliberately the safe end of each switch that matters — demo tooling off,
 * maintenance banner off — so an environment that has never been configured does not
 * accidentally advertise demo tools.
 */
export const SITE_SETTINGS_PATH = { collection: 'platformSettings', doc: 'site' } as const;

export function siteSettingsRef() {
  return adminDb.collection(SITE_SETTINGS_PATH.collection).doc(SITE_SETTINGS_PATH.doc);
}

export async function readSiteSettings(): Promise<SiteSettings> {
  try {
    const snapshot = await siteSettingsRef().get();
    if (!snapshot.exists) return DEFAULT_SITE_SETTINGS;
    const stored = snapshot.data() ?? {};
    // Merged over the defaults rather than trusted whole: a settings document written by an
    // older build is missing keys a newer one reads, and a missing key must fall back to the
    // safe default rather than render as undefined.
    return { ...DEFAULT_SITE_SETTINGS, ...stored } as SiteSettings;
  } catch {
    // The public site must render even when the settings read fails. Defaults are a worse
    // answer than live settings and a much better one than an error page.
    return DEFAULT_SITE_SETTINGS;
  }
}
