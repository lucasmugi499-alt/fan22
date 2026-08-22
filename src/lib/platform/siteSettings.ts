import { z } from 'zod';

/**
 * The settings an operator may change from a console, and the line around them.
 *
 * Everything here is reversible, publicly visible within a minute, and safe to get wrong for
 * a minute: site copy, whether a registration window is open, whether a section is shown. If
 * an operator flips one by accident they see the result immediately and flip it back.
 *
 * The switches deliberately NOT here are the ones where being wrong for a minute is the
 * whole problem — moving production traffic, enabling real payments, changing finalizer
 * mode, activating an environment. Those are not settings, they are events: they need
 * readiness checks, a second approver, a maintenance window and an audit trail, and the
 * activation workflow already models them that way. Putting one behind the same toggle as
 * "show fantasy" would be the most dangerous control on the platform.
 *
 * That line is enforced rather than documented. `siteSettingsPatchSchema` is strict, so a
 * governed switch is not a refused key — it is a key with nowhere to go.
 */

export type MaintenanceBanner = {
  enabled: boolean;
  message: string;
};

export type SiteSettings = {
  /** Bumped on every write, so a stale console cannot overwrite a newer change. */
  version: number;
  publicHeadline: string;
  publicSubheadline: string;
  /** Site-wide announcement. Empty string means no announcement, never null. */
  announcement: string;
  registrationOpen: boolean;
  leagueApplicationsOpen: boolean;
  fantasyVisible: boolean;
  supportCampaignsVisible: boolean;
  maintenanceBanner: MaintenanceBanner;
  /** Demo and investor tooling. Never true in production — see `isDemoModeEnabled`. */
  demoToolsVisible: boolean;
  updatedAt: string;
  updatedByUserId: string;
};

/**
 * Switches that must never become a checkbox on this page.
 *
 * Listed by name so the boundary is greppable and testable, not folklore. Each one already
 * has, or needs, an approval workflow instead.
 */
export const GOVERNED_SWITCHES = [
  'productionTrafficRouting',
  'realPaymentsEnabled',
  'finalizerMode',
  'environmentActivation',
] as const;

export type GovernedSwitch = (typeof GOVERNED_SWITCHES)[number];

export const GOVERNED_SWITCH_REASON: Record<GovernedSwitch, string> = {
  productionTrafficRouting:
    'Traffic routing is an activation workflow with a second approver and a maintenance window, not a setting.',
  realPaymentsEnabled:
    'Enabling real payments moves other people’s money. It requires a payment-provider readiness review, not a toggle.',
  finalizerMode:
    'Finalizer mode decides whether official results are written. It is configured per runtime and verified against the Cloud Functions copy.',
  environmentActivation:
    'Activating an environment is a recorded process: readiness, typed confirmation, approval, maintenance, routing, smoke tests, audit.',
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  version: 0,
  publicHeadline: 'Verified grassroots sport',
  publicSubheadline: 'Fixtures, official results, athletes, and league updates from the people you follow.',
  announcement: '',
  registrationOpen: true,
  leagueApplicationsOpen: true,
  fantasyVisible: true,
  supportCampaignsVisible: true,
  maintenanceBanner: { enabled: false, message: '' },
  demoToolsVisible: false,
  updatedAt: '1970-01-01T00:00:00.000Z',
  updatedByUserId: 'system',
};

const maintenanceBannerSchema = z.object({
  enabled: z.boolean(),
  message: z.string().trim().max(280),
});

/**
 * `.strict()` is the enforcement, not decoration.
 *
 * A patch naming `finalizerMode` fails validation with "Unrecognized key" rather than being
 * quietly dropped, so an attempt to smuggle a governed switch through this route is a loud
 * 400 and not a silent no-op that an operator reads as success.
 */
export const siteSettingsPatchSchema = z
  .object({
    publicHeadline: z.string().trim().min(3).max(120),
    publicSubheadline: z.string().trim().min(3).max(240),
    announcement: z.string().trim().max(280),
    registrationOpen: z.boolean(),
    leagueApplicationsOpen: z.boolean(),
    fantasyVisible: z.boolean(),
    supportCampaignsVisible: z.boolean(),
    maintenanceBanner: maintenanceBannerSchema,
    demoToolsVisible: z.boolean(),
  })
  .strict()
  .partial();

export type SiteSettingsPatch = z.infer<typeof siteSettingsPatchSchema>;

/** Every field an operator may edit. Used by the UI and by the boundary test. */
export const EDITABLE_SETTING_KEYS = [
  'publicHeadline',
  'publicSubheadline',
  'announcement',
  'registrationOpen',
  'leagueApplicationsOpen',
  'fantasyVisible',
  'supportCampaignsVisible',
  'maintenanceBanner',
  'demoToolsVisible',
] as const satisfies readonly (keyof SiteSettingsPatch)[];

export function isGovernedSwitch(key: string): key is GovernedSwitch {
  return (GOVERNED_SWITCHES as readonly string[]).includes(key);
}

/**
 * A maintenance banner that is enabled but says nothing is worse than no banner: the reader
 * learns something is wrong and nothing about what or for how long.
 */
export function maintenanceBannerProblem(banner: MaintenanceBanner): string | null {
  if (!banner.enabled) return null;
  if (banner.message.trim().length < 10) {
    return 'A maintenance banner needs a message telling people what is happening and roughly for how long.';
  }
  return null;
}

/** Which patched fields actually differ, so the audit records a change and not a save. */
export function changedSettingKeys(current: SiteSettings, patch: SiteSettingsPatch): string[] {
  return Object.entries(patch)
    .filter(([key, value]) => {
      const existing = current[key as keyof SiteSettings];
      return JSON.stringify(existing) !== JSON.stringify(value);
    })
    .map(([key]) => key);
}

export function applySiteSettingsPatch(
  current: SiteSettings,
  patch: SiteSettingsPatch,
  actorUserId: string,
  now: string,
): SiteSettings {
  return {
    ...current,
    ...patch,
    version: current.version + 1,
    updatedAt: now,
    updatedByUserId: actorUserId,
  };
}
