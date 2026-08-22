'use client';

import { useEffect, useMemo, useState } from 'react';
import { Lock } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, PlatformAdminHeader, StatusChip } from '@/components/platform/PlatformAdminPrimitives';
import { CommandDialog } from '@/components/platform/commands/CommandDialog';
import { usePlatformCommand } from '@/components/platform/commands/usePlatformCommand';
import {
  DEFAULT_SITE_SETTINGS,
  GOVERNED_SWITCHES,
  GOVERNED_SWITCH_REASON,
  changedSettingKeys,
  maintenanceBannerProblem,
  type SiteSettings,
  type SiteSettingsPatch,
} from '@/lib/platform/siteSettings';

/**
 * What the public sees, and the line around it.
 *
 * Two things are on this page that would normally be left off. The first is the list of
 * governed switches, shown locked with the reason each one is not a checkbox — an operator
 * looking for "turn on payments" should find out here that it is an approval workflow,
 * rather than concluding the console is missing a feature and going looking for a config
 * file. The second is the pending-change summary: nothing saves until the operator has seen
 * the exact list of fields they are about to change, because a settings form that saves
 * everything on screen makes an accidental edit indistinguishable from an intended one.
 */

const TOGGLES: { key: keyof SiteSettingsPatch; label: string; description: string }[] = [
  { key: 'registrationOpen', label: 'Registration open', description: 'New supporters and operators can create accounts.' },
  { key: 'leagueApplicationsOpen', label: 'League applications open', description: 'Organisers can apply to bring a competition onto the platform.' },
  { key: 'fantasyVisible', label: 'Fantasy visible', description: 'Fantasy appears in navigation and on the public site.' },
  { key: 'supportCampaignsVisible', label: 'Support campaigns visible', description: 'Backing campaigns are shown to fans.' },
  { key: 'demoToolsVisible', label: 'Demo tools visible', description: 'Investor and demo tooling. Never enabled in production.' },
];

const COPY_FIELDS: { key: 'publicHeadline' | 'publicSubheadline' | 'announcement'; label: string; hint: string }[] = [
  { key: 'publicHeadline', label: 'Public headline', hint: 'The first line a visitor reads.' },
  { key: 'publicSubheadline', label: 'Public subheadline', hint: 'One sentence under the headline.' },
  { key: 'announcement', label: 'Site announcement', hint: 'Leave empty for no announcement.' },
];

export function WebsiteSettings() {
  const { currentUser, isDemoMode } = useAuth();
  const [fetched, setFetched] = useState<SiteSettings | null>(null);
  const [edited, setEdited] = useState<SiteSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const command = usePlatformCommand('/api/platform/site');

  /**
   * Demo sessions read the shipped defaults rather than a live document: there is no
   * operator session to authenticate with, and inventing plausible settings would
   * misrepresent what this environment actually serves. Derived rather than assigned in an
   * effect, so the demo path costs no render pass and no synchronous setState.
   */
  const saved = isDemoMode ? DEFAULT_SITE_SETTINGS : fetched;
  /** The draft is the saved document until the operator touches something. */
  const draft = edited ?? saved;

  /**
   * Reload counter rather than a callable loader.
   *
   * Defining the fetch inside the effect keeps every setState behind an await, which is what
   * the surrounding platform pages do and what stops a synchronous failure path — a missing
   * token, say — from setting state during the effect body.
   */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (isDemoMode) return;
    let cancelled = false;
    async function load() {
      try {
        if (!currentUser || typeof currentUser.getIdToken !== 'function') {
          throw new Error('Sign in again to read site settings.');
        }
        const token = await currentUser.getIdToken();
        const response = await fetch('/api/platform/site', {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? 'Site settings are unavailable.');
        if (cancelled) return;
        setFetched(body as SiteSettings);
        setEdited(null);
        setLoadError(null);
      } catch (cause) {
        if (cancelled) return;
        setLoadError(cause instanceof Error ? cause.message : 'Site settings are unavailable.');
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [currentUser, isDemoMode, reloadToken]);

  const patch = useMemo<SiteSettingsPatch>(() => {
    if (!saved || !draft) return {};
    return {
      publicHeadline: draft.publicHeadline,
      publicSubheadline: draft.publicSubheadline,
      announcement: draft.announcement,
      registrationOpen: draft.registrationOpen,
      leagueApplicationsOpen: draft.leagueApplicationsOpen,
      fantasyVisible: draft.fantasyVisible,
      supportCampaignsVisible: draft.supportCampaignsVisible,
      demoToolsVisible: draft.demoToolsVisible,
      maintenanceBanner: draft.maintenanceBanner,
    };
  }, [draft, saved]);

  const changed = useMemo(
    () => (saved ? changedSettingKeys(saved, patch) : []),
    [saved, patch],
  );

  if (loadError) {
    return (
      <section className="space-y-5">
        <PlatformAdminHeader eyebrow="Website & settings" title="Website and settings" description="What the public sees." />
        <EmptyState title="Site settings are unavailable">{loadError}</EmptyState>
      </section>
    );
  }
  if (!saved || !draft) return <Skeleton className="h-[560px] rounded-[var(--radius-lg)]" />;

  const bannerProblem = maintenanceBannerProblem(draft.maintenanceBanner);
  const set = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) =>
    setEdited({ ...draft, [key]: value });

  return (
    <section className="space-y-5">
      <PlatformAdminHeader
        eyebrow="Website & settings"
        title="Website and settings"
        description="Public copy, registration windows and feature visibility. Everything here is reversible and visible to the public within a minute — which is exactly why the switches that are not reversible live somewhere else."
      />

      {isDemoMode ? (
        <Card className="p-4">
          <p className="text-sm text-text-strong">Demo session — these are the defaults, not this environment&rsquo;s settings.</p>
          <p className="mt-1 text-sm text-muted">
            Reading and changing site settings needs a signed-in platform operator. The values
            below are the shipped defaults so the page can be reviewed; saving is refused.
          </p>
        </Card>
      ) : null}

      <Card className="p-4">
        <h2 className="mb-3 text-[15px] font-semibold text-text-strong">Public copy</h2>
        <div className="space-y-3">
          {COPY_FIELDS.map((field) => (
            <label key={field.key} className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">{field.label}</span>
              <input
                type="text"
                value={draft[field.key]}
                maxLength={field.key === 'publicHeadline' ? 120 : 280}
                onChange={(event) => set(field.key, event.target.value)}
                className="min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text-strong"
              />
              <span className="mt-1 block text-xs text-subtle">{field.hint}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-[15px] font-semibold text-text-strong">Feature availability</h2>
        <div className="space-y-2.5">
          {TOGGLES.map((toggle) => (
            <label
              key={String(toggle.key)}
              className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text-strong">{toggle.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{toggle.description}</span>
              </span>
              <input
                type="checkbox"
                checked={Boolean(draft[toggle.key as keyof SiteSettings])}
                onChange={(event) => set(toggle.key as keyof SiteSettings, event.target.checked as never)}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand)]"
              />
            </label>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-[15px] font-semibold text-text-strong">Maintenance banner</h2>
        <label className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
          <span className="text-sm font-semibold text-text-strong">Show the banner</span>
          <input
            type="checkbox"
            checked={draft.maintenanceBanner.enabled}
            onChange={(event) => set('maintenanceBanner', { ...draft.maintenanceBanner, enabled: event.target.checked })}
            className="h-5 w-5 accent-[var(--brand)]"
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-subtle">Message</span>
          <textarea
            rows={2}
            maxLength={280}
            placeholder="What is happening, and roughly for how long."
            value={draft.maintenanceBanner.message}
            onChange={(event) => set('maintenanceBanner', { ...draft.maintenanceBanner, message: event.target.value })}
            className="w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2 text-sm text-text-strong"
          />
        </label>
        {bannerProblem ? <p className="mt-2 text-sm text-[var(--state-disputed)]">{bannerProblem}</p> : null}
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <Lock className="h-4 w-4 text-subtle" weight="fill" />
          <h2 className="text-[15px] font-semibold text-text-strong">Not settings</h2>
        </div>
        <p className="mb-3 text-sm text-muted">
          These are listed so nobody goes looking for them in a config file. Each one is an
          event with an approval workflow, not a switch — being wrong for a minute is the
          whole problem with all four.
        </p>
        <div className="space-y-2.5">
          {GOVERNED_SWITCHES.map((governed) => (
            <div key={governed} className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-text-strong">
                  {governed.replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase())}
                </p>
                <StatusChip label="governed" tone="warn" />
              </div>
              <p className="mt-1 text-sm text-muted">{GOVERNED_SWITCH_REASON[governed]}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-strong">
              {changed.length ? `${changed.length} pending change${changed.length === 1 ? '' : 's'}` : 'No pending changes'}
            </p>
            <p className="mt-1 text-xs text-muted">
              {changed.length
                ? changed.join(', ')
                : `Saved version ${saved.version}, last changed by ${saved.updatedByUserId}.`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!changed.length}
              onClick={() => setEdited(null)}
              className="min-h-11 rounded-[var(--radius-md)] border border-border px-4 text-sm font-medium text-muted disabled:opacity-40"
            >
              Discard
            </button>
            <button
              type="button"
              disabled={!changed.length || Boolean(bannerProblem)}
              onClick={() => setConfirming(true)}
              className="min-h-11 rounded-[var(--radius-md)] bg-brand px-4 text-sm font-semibold text-on-brand disabled:opacity-40"
            >
              Review and save
            </button>
          </div>
        </div>
        {command.success ? <p className="mt-3 text-sm text-brand">{command.success}</p> : null}
        {command.error && !confirming ? <p className="mt-3 text-sm text-[var(--state-disputed)]">{command.error}</p> : null}
      </Card>

      <CommandDialog
        open={confirming}
        title="Save site settings"
        description={`This changes what the public sees: ${changed.join(', ')}. The reason is written to the audit trail.`}
        submitLabel="Save settings"
        running={command.running}
        error={command.error}
        onClose={() => { setConfirming(false); command.reset(); }}
        onSubmit={async (_values, reason) => {
          const ok = await command.run(
            // The version the operator was looking at travels with the change, so a second
            // operator's save cannot be silently reverted by this one.
            { reason, expectedVersion: saved.version, patch: Object.fromEntries(changed.map((key) => [key, patch[key as keyof SiteSettingsPatch]])) },
            'Site settings saved.',
          );
          if (ok) {
            setConfirming(false);
            setReloadToken((token) => token + 1);
          }
        }}
      />
    </section>
  );
}
