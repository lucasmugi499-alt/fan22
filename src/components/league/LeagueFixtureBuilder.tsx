'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Sheet } from '@/components/ui/Sheet';
import { useAuth } from '@/context/AuthProvider';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { fixturesFromPreview } from '@/lib/fixtureGenerator';
import {
  buildSchedulePreview,
  publicationNotice,
  validateFixture,
  type MatchDay,
  type ScheduleFormat,
} from '@/lib/league/schedule';
import { effectiveCapturePolicy } from '@/lib/capturePolicy';
import type { League, Match, Season, Team } from '@/types';
import { cn } from '@/lib/utils';

type Mode = 'generate' | 'single';

const DAY_LABELS: Array<{ value: MatchDay; label: string }> = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

/**
 * The two ways a season's fixtures come into existence.
 *
 * Generating is the common case and the one that was missing: ten clubs playing home and away
 * is ninety fixtures, and typing those by hand is an afternoon and a source of duplicates. A
 * single fixture is the exception — a re-arranged cup tie, a friendly — and gets its own path
 * rather than being a schedule of one.
 *
 * Both end at the same trusted command. Nothing is written until the League Admin has read
 * what will be created and said so.
 */
export function LeagueFixtureBuilder({
  open,
  league,
  season,
  teams,
  existingFixtures,
  onClose,
  onPublished,
}: {
  open: boolean;
  league: League;
  season?: Season;
  teams: Team[];
  existingFixtures: Match[];
  onClose: () => void;
  onPublished: () => void;
}) {
  const { isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [mode, setMode] = useState<Mode>('generate');
  const [publishing, setPublishing] = useState(false);

  const [format, setFormat] = useState<ScheduleFormat>('double_round_robin');
  const [startDate, setStartDate] = useState(season?.startDate?.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(season?.endDate?.slice(0, 10) ?? '');
  const [matchDays, setMatchDays] = useState<MatchDay[]>([6]);
  const [kickoffTime, setKickoffTime] = useState('15:00');

  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [singleKickoff, setSingleKickoff] = useState('');
  const [singleVenue, setSingleVenue] = useState('');

  const policy = effectiveCapturePolicy(season?.capturePolicy, undefined);

  const preview = useMemo(() => {
    if (mode !== 'generate' || !startDate || !endDate) return null;
    return buildSchedulePreview({
      teams: teams.map((team) => ({ id: team.id, name: team.name, homeVenue: team.location })),
      format,
      window: { startDate, endDate, matchDays, kickoffTime },
      defaultVenue: `${league.city} league ground`,
    });
  }, [endDate, format, kickoffTime, league.city, matchDays, mode, startDate, teams]);

  const singleErrors = useMemo(() => {
    if (mode !== 'single' || !homeTeamId || !awayTeamId || !singleKickoff) return [];
    return validateFixture({
      draft: {
        homeTeamId,
        awayTeamId,
        scheduledAt: new Date(singleKickoff).toISOString(),
        venue: singleVenue,
      },
      existing: existingFixtures.map((fixture) => ({
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        scheduledAt: fixture.scheduledAt,
        venue: fixture.venue,
      })),
      seasonStart: season?.startDate,
      seasonEnd: season?.endDate,
      competitionTeamIds: teams.map((team) => team.id),
    });
  }, [awayTeamId, existingFixtures, homeTeamId, mode, season, singleKickoff, singleVenue, teams]);

  async function publish() {
    if (!season) {
      toast.error('Open a season before creating fixtures.');
      return;
    }
    setPublishing(true);
    try {
      const rows = mode === 'generate'
        ? preview?.fixtures ?? []
        : [{
          round: 0,
          homeTeamId,
          awayTeamId,
          scheduledAt: new Date(singleKickoff).toISOString(),
          venue: singleVenue || `${league.city} league ground`,
        }];
      if (!rows.length) throw new Error('There is nothing to publish.');
      const fixtures = fixturesFromPreview({ league, season, teams, preview: rows });
      await provider.createFixtures(fixtures);
      toast.success(
        fixtures.length === 1
          ? 'Fixture created.'
          : `${fixtures.length} fixtures published.`,
      );
      onPublished();
      onClose();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Fixtures could not be created.');
    } finally {
      setPublishing(false);
    }
  }

  const canPublish = mode === 'generate'
    ? Boolean(preview && !preview.blockers.length && preview.fixtures.length)
    : Boolean(homeTeamId && awayTeamId && singleKickoff && !singleErrors.length);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      mobileFullScreen
      title={mode === 'generate' ? 'Generate schedule' : 'Create fixture'}
      description={season?.name ?? league.name}
    >
      <div className="space-y-4">
        <div className="flex gap-2" role="tablist" aria-label="Fixture creation">
          {(['generate', 'single'] as Mode[]).map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={mode === entry}
              onClick={() => setMode(entry)}
              className={cn(
                'min-h-11 flex-1 rounded-[var(--radius-md)] border px-3 text-sm font-semibold transition',
                mode === entry
                  ? 'border-brand bg-brand-subtle text-brand'
                  : 'border-border text-muted hover:text-text-strong',
              )}
            >
              {entry === 'generate' ? 'Generate schedule' : 'Single fixture'}
            </button>
          ))}
        </div>

        {mode === 'generate' ? (
          <>
            <Field label="Format">
              <select
                value={format}
                onChange={(event) => setFormat(event.target.value as ScheduleFormat)}
                className="field"
              >
                <option value="single_round_robin">Single round robin — everyone plays once</option>
                <option value="double_round_robin">Double round robin — home and away</option>
                <option value="knockout">Knockout</option>
              </select>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Season starts">
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="field" />
              </Field>
              <Field label="Season ends">
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="field" />
              </Field>
            </div>

            <Field label="Match days">
              <div className="flex flex-wrap gap-1.5">
                {DAY_LABELS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    aria-pressed={matchDays.includes(day.value)}
                    onClick={() => setMatchDays((current) => current.includes(day.value)
                      ? current.filter((entry) => entry !== day.value)
                      : [...current, day.value])}
                    className={cn(
                      'min-h-11 min-w-11 rounded-[var(--radius-md)] border px-3 text-sm font-semibold transition',
                      matchDays.includes(day.value)
                        ? 'border-brand bg-brand-subtle text-brand'
                        : 'border-border text-muted',
                    )}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Kickoff">
              <input type="time" value={kickoffTime} onChange={(event) => setKickoffTime(event.target.value)} className="field" />
            </Field>

            {preview?.blockers.length ? (
              <ul className="space-y-1.5 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--state-error),transparent_55%)] p-3">
                {preview.blockers.map((blocker) => (
                  <li key={blocker} className="text-sm leading-6 text-[var(--state-error)]">{blocker}</li>
                ))}
              </ul>
            ) : null}

            {preview?.warnings.length ? (
              <p className="text-sm leading-6 text-[var(--state-pending)]">{preview.warnings.join(' ')}</p>
            ) : null}

            {preview && !preview.blockers.length && preview.fixtures.length ? (
              <SchedulePreviewList preview={preview} />
            ) : null}
          </>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Home club">
                <select value={homeTeamId} onChange={(event) => setHomeTeamId(event.target.value)} className="field">
                  <option value="">Choose…</option>
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </Field>
              <Field label="Away club">
                <select value={awayTeamId} onChange={(event) => setAwayTeamId(event.target.value)} className="field">
                  <option value="">Choose…</option>
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Kickoff">
              <input type="datetime-local" value={singleKickoff} onChange={(event) => setSingleKickoff(event.target.value)} className="field" />
            </Field>
            <Field label="Venue">
              <input value={singleVenue} onChange={(event) => setSingleVenue(event.target.value)} placeholder="Nakivubo Stadium" className="field normal-case" />
            </Field>

            {singleErrors.length ? (
              <ul className="space-y-1.5 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--state-error),transparent_55%)] p-3">
                {singleErrors.map((error) => (
                  <li key={error} className="text-sm leading-6 text-[var(--state-error)]">{error}</li>
                ))}
              </ul>
            ) : null}
          </>
        )}

        {canPublish ? (
          <p className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm leading-6 text-muted">
            {publicationNotice(policy, mode === 'generate' ? preview!.fixtures.length : 1)}
          </p>
        ) : null}

        <button
          type="button"
          disabled={!canPublish || publishing}
          onClick={() => void publish()}
          className={cn(
            'min-h-11 w-full rounded-[var(--radius-md)] px-4 text-sm font-semibold transition',
            canPublish && !publishing
              ? 'bg-brand text-[var(--on-brand)] hover:bg-brand-hover'
              : 'cursor-not-allowed bg-surface-3 text-subtle',
          )}
        >
          {publishing
            ? 'Publishing…'
            : mode === 'generate' ? 'Publish schedule' : 'Create fixture'}
        </button>
      </div>
    </Sheet>
  );
}

/**
 * The schedule as it will be played, grouped by round.
 *
 * Grouped rather than listed flat because a League Admin reviews a season one matchday at a
 * time, and ninety rows with no structure is not a review.
 */
function SchedulePreviewList({
  preview,
}: {
  preview: NonNullable<ReturnType<typeof buildSchedulePreview>>;
}) {
  const fixtures = preview.fixtures;
  const rounds = useMemo(() => {
    const grouped = new Map<number, typeof fixtures>();
    for (const fixture of fixtures) {
      grouped.set(fixture.round, [...(grouped.get(fixture.round) ?? []), fixture]);
    }
    return [...grouped.entries()].sort(([a], [b]) => a - b);
  }, [fixtures]);

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-text-strong">
        {preview.fixtures.length} fixtures across {preview.rounds} rounds
      </p>
      <div className="max-h-80 space-y-3 overflow-y-auto rounded-[var(--radius-md)] border border-border p-3">
        {rounds.map(([round, fixtures]) => (
          <div key={round}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">
              Round {round} ·{' '}
              {new Intl.DateTimeFormat('en-UG', {
                weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Kampala',
              }).format(new Date(fixtures[0].scheduledAt))}
            </p>
            <ul className="mt-1 space-y-0.5">
              {fixtures.map((fixture) => (
                <li key={`${fixture.homeTeamId}-${fixture.awayTeamId}`} className="text-sm text-text">
                  {fixture.homeTeamName} <span className="text-subtle">v</span> {fixture.awayTeamName}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wide text-subtle">
      {label}
      <div className="mt-1.5 normal-case">{children}</div>
    </label>
  );
}
