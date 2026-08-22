import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SITE_SETTINGS,
  EDITABLE_SETTING_KEYS,
  GOVERNED_SWITCHES,
  applySiteSettingsPatch,
  changedSettingKeys,
  isGovernedSwitch,
  maintenanceBannerProblem,
  siteSettingsPatchSchema,
} from './siteSettings';

describe('site settings', () => {
  it('refuses every governed switch by name', () => {
    // The boundary that matters: these are events with approval workflows, not settings.
    // A strict schema makes each one a loud 400 rather than a silently dropped key that an
    // operator reads as a successful save.
    for (const governed of GOVERNED_SWITCHES) {
      const outcome = siteSettingsPatchSchema.safeParse({ [governed]: true });
      expect(outcome.success, `${governed} must not be settable`).toBe(false);
      expect(isGovernedSwitch(governed)).toBe(true);
    }
  });

  it('keeps the editable surface and the governed surface disjoint', () => {
    const overlap = EDITABLE_SETTING_KEYS.filter((key) => isGovernedSwitch(key));
    expect(overlap).toEqual([]);
  });

  it('refuses unknown keys outright', () => {
    expect(siteSettingsPatchSchema.safeParse({ somethingNew: true }).success).toBe(false);
  });

  it('accepts a partial patch of real settings', () => {
    const outcome = siteSettingsPatchSchema.safeParse({ fantasyVisible: false });
    expect(outcome.success).toBe(true);
  });

  it('requires a maintenance banner to say something', () => {
    // A banner that announces trouble without naming it tells a reader only to worry.
    expect(maintenanceBannerProblem({ enabled: true, message: 'Down' })).toContain('what is happening');
    expect(maintenanceBannerProblem({ enabled: true, message: 'Results paused until 14:00 EAT.' })).toBeNull();
    expect(maintenanceBannerProblem({ enabled: false, message: '' })).toBeNull();
  });

  it('records a change rather than a save', () => {
    expect(changedSettingKeys(DEFAULT_SITE_SETTINGS, { fantasyVisible: true })).toEqual([]);
    expect(changedSettingKeys(DEFAULT_SITE_SETTINGS, { fantasyVisible: false })).toEqual(['fantasyVisible']);
    expect(changedSettingKeys(DEFAULT_SITE_SETTINGS, {
      maintenanceBanner: { enabled: true, message: 'Results paused until 14:00 EAT.' },
    })).toEqual(['maintenanceBanner']);
  });

  it('bumps the version on every applied patch', () => {
    // A stale console holding version 3 must not be able to overwrite version 4.
    const next = applySiteSettingsPatch(DEFAULT_SITE_SETTINGS, { registrationOpen: false }, 'operator_1', '2026-08-22T10:00:00.000Z');
    expect(next.version).toBe(DEFAULT_SITE_SETTINGS.version + 1);
    expect(next.registrationOpen).toBe(false);
    expect(next.updatedByUserId).toBe('operator_1');
    expect(next.publicHeadline).toBe(DEFAULT_SITE_SETTINGS.publicHeadline);
  });
});
