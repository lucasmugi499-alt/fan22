'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, RocketLaunch, ShieldCheck, Warning } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthProvider';
import { fantasyDemo } from '@/data/fantasyDemo';
import { FANTASY_SCORING_PROFILES, FANTASY_SQUAD_RULES } from '@/lib/fantasy/profiles';
import { validateFantasyActivation, type FantasyActivationReadiness } from '@/lib/fantasy/activation';
import { toSportSlug } from '@/lib/season';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { League, Season } from '@/types';
import type {
  FantasyCompetition,
  FantasyCompetitionStatus,
  FantasyDataLevel,
  FantasyScoringProfile,
  FantasySquadRules,
} from '@/types/fantasy';

type Mode = 'league' | 'platform';
type DemoCompetition = FantasyCompetition & {
  demoOnly?: true;
  sourceCompetitionId?: string;
};
type FantasyAdminState = {
  role: string;
  leagues: League[];
  seasons: Season[];
  competitions: FantasyCompetition[];
  scoringProfiles: FantasyScoringProfile[];
  squadRules: FantasySquadRules[];
  readinessByCompetition: Record<string, FantasyActivationReadiness>;
};

const demoProposalKey = 'goalplace256:fantasy-demo-proposals';

function cleanSport(league?: Pick<League, 'sport'>) {
  return toSportSlug(league?.sport ?? 'football');
}

function defaultRecordedKeys(profile?: FantasyScoringProfile, dataLevel: FantasyDataLevel = 'basic') {
  const order: Record<FantasyDataLevel, number> = { basic: 1, standard: 2, advanced: 3 };
  return [...new Set((profile?.rules ?? [])
    .filter((rule) => rule.enabled && order[rule.requiredDataLevel] <= order[dataLevel])
    .map((rule) => rule.requiredStatKey))]
    .join(', ');
}

function readDemoProposals() {
  if (typeof window === 'undefined') return [] as DemoCompetition[];
  try {
    const stored = window.localStorage.getItem(demoProposalKey);
    return stored ? JSON.parse(stored) as DemoCompetition[] : [];
  } catch {
    return [];
  }
}

function storeDemoProposals(proposals: DemoCompetition[]) {
  window.localStorage.setItem(demoProposalKey, JSON.stringify(proposals));
}

function readinessForDemo(competition: DemoCompetition) {
  const sourceCompetitionId = competition.sourceCompetitionId ?? competition.id;
  return validateFantasyActivation({
    competition,
    scoringProfile: FANTASY_SCORING_PROFILES.find((profile) => profile.id === competition.scoringProfileId) ?? null,
    squadRules: FANTASY_SQUAD_RULES.find((rules) => rules.id === competition.squadRulesId) ?? null,
    players: fantasyDemo.players
      .filter((player) => player.competitionId === sourceCompetitionId)
      .map((player) => ({
        ...player,
        id: player.id.replace(sourceCompetitionId, competition.id),
        competitionId: competition.id,
      })),
    prices: fantasyDemo.playerPrices
      .filter((price) => price.competitionId === sourceCompetitionId)
      .map((price) => ({
        ...price,
        id: price.id.replace(sourceCompetitionId, competition.id),
        competitionId: competition.id,
      })),
    rounds: fantasyDemo.rounds
      .filter((round) => round.competitionId === sourceCompetitionId)
      .map((round) => ({
        ...round,
        id: round.id.replace(sourceCompetitionId, competition.id),
        competitionId: competition.id,
      })),
  });
}

function toDisplayStatus(status: FantasyCompetitionStatus) {
  return status.replace(/_/g, ' ');
}

function statusTone(status: FantasyCompetitionStatus) {
  if (status === 'active' || status === 'completed') return 'good';
  if (status === 'proposed' || status === 'approved') return 'warn';
  return 'neutral';
}

export function FantasyActivationControl({
  mode,
  league,
  leagues,
  seasons,
}: {
  mode: Mode;
  league?: League;
  leagues?: League[];
  seasons?: Season[];
}) {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const fallbackLeagues = useMemo(() => league ? [league] : (leagues ?? []), [league, leagues]);
  const fallbackSeasons = useMemo(() => seasons ?? [], [seasons]);
  const [remoteState, setRemoteState] = useState<FantasyAdminState | null>(null);
  const [demoProposals, setDemoProposals] = useState<DemoCompetition[]>(() => readDemoProposals());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedLeagueId, setSelectedLeagueId] = useState(league?.id ?? fallbackLeagues[0]?.id ?? '');
  const [dataLevel, setDataLevel] = useState<FantasyDataLevel>('basic');
  const selectedLeague = fallbackLeagues.find((item) => item.id === selectedLeagueId) ?? fallbackLeagues[0];
  const selectedSport = cleanSport(selectedLeague);
  const selectedProfile = FANTASY_SCORING_PROFILES.find((profile) => profile.sport === selectedSport);
  const [recordedKeys, setRecordedKeys] = useState('');
  const effectiveRecordedKeys = recordedKeys || defaultRecordedKeys(selectedProfile, dataLevel);
  const selectedSeason = fallbackSeasons.find((item) =>
    item.leagueId === selectedLeague?.id
    && (!selectedLeague?.currentSeasonId || item.id === selectedLeague.currentSeasonId),
  ) ?? fallbackSeasons.find((item) => item.leagueId === selectedLeague?.id);

  useEffect(() => {
    if (isDemoMode) return;
    let cancelled = false;
    async function load() {
      if (!currentUser || typeof currentUser.getIdToken !== 'function') return;
      setLoading(true);
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch('/api/fantasy/admin', {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? 'Fantasy launch state could not be loaded.');
        if (!cancelled) setRemoteState(body as FantasyAdminState);
      } catch (cause) {
        if (!cancelled) toast.error(cause instanceof Error ? cause.message : 'Fantasy launch state could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [currentUser, isDemoMode, refreshKey]);

  const state = useMemo((): FantasyAdminState => {
    if (remoteState && !isDemoMode) return remoteState;
    if (!isDemoMode) {
      return {
        role: userProfile?.role ?? mode,
        leagues: fallbackLeagues,
        seasons: fallbackSeasons,
        competitions: [],
        scoringProfiles: FANTASY_SCORING_PROFILES,
        squadRules: FANTASY_SQUAD_RULES,
        readinessByCompetition: {},
      };
    }
    const visibleLeagueIds = new Set(fallbackLeagues.map((item) => item.id));
    const competitions = [...fantasyDemo.competitions, ...demoProposals]
      .filter((competition) => !visibleLeagueIds.size || visibleLeagueIds.has(competition.leagueId));
    return {
      role: userProfile?.role ?? mode,
      leagues: fallbackLeagues,
      seasons: fallbackSeasons,
      competitions,
      scoringProfiles: FANTASY_SCORING_PROFILES,
      squadRules: FANTASY_SQUAD_RULES,
      readinessByCompetition: Object.fromEntries(
        competitions.map((competition) => [competition.id, readinessForDemo(competition as DemoCompetition)]),
      ),
    };
  }, [demoProposals, fallbackLeagues, fallbackSeasons, isDemoMode, mode, remoteState, userProfile?.role]);

  const visibleLeagues = state.leagues.length ? state.leagues : fallbackLeagues;
  const activeSelectedLeague = visibleLeagues.find((item) => item.id === selectedLeagueId) ?? visibleLeagues[0];
  const activeSport = cleanSport(activeSelectedLeague);
  const profile = state.scoringProfiles.find((item) => item.sport === activeSport && item.status === 'approved');
  const rules = state.squadRules.find((item) => item.sport === activeSport);
  const season = state.seasons.find((item) =>
    item.leagueId === activeSelectedLeague?.id
    && (!activeSelectedLeague?.currentSeasonId || item.id === activeSelectedLeague.currentSeasonId),
  ) ?? state.seasons.find((item) => item.leagueId === activeSelectedLeague?.id) ?? selectedSeason;
  const competitions = state.competitions
    .filter((competition) => !activeSelectedLeague || competition.leagueId === activeSelectedLeague.id)
    .sort((left, right) => left.status.localeCompare(right.status) || left.name.localeCompare(right.name));
  const actionable = competitions.filter((competition) => ['proposed', 'approved'].includes(competition.status));
  const readyCount = competitions.filter((competition) => state.readinessByCompetition[competition.id]?.ready).length;
  const canPropose = Boolean(activeSelectedLeague && season && profile && rules);

  async function proposeCompetition() {
    if (!activeSelectedLeague || !season || !profile || !rules) {
      toast.error('Choose a league with an active season and approved fantasy rules.');
      return;
    }
    setSaving(true);
    try {
      const keys = effectiveRecordedKeys.split(',').map((item) => item.trim()).filter(Boolean);
      const base = {
        name: `${activeSelectedLeague.name} Fantasy Pilot`,
        shortName: `${activeSelectedLeague.name.split(' ').slice(0, 2).join(' ')} Fantasy`.slice(0, 30),
        sport: activeSport,
        variant: rules.variant,
        leagueId: activeSelectedLeague.id,
        seasonId: season.id,
        scoringProfileId: profile.id,
        squadRulesId: rules.id,
        dataLevel,
        recordedStatKeys: keys.length ? keys : defaultRecordedKeys(profile, dataLevel).split(', '),
      };
      if (isDemoMode) {
        const template = fantasyDemo.competitions.find((competition) => competition.leagueId === activeSelectedLeague.id);
        if (!template) throw new Error('Demo fantasy roster is not seeded for this league yet.');
        const next: DemoCompetition = {
          ...template,
          ...base,
          id: `demo_fantasy_proposal_${activeSelectedLeague.id}`,
          status: 'proposed',
          scoringProfileVersion: profile.version,
          proposedByUserId: userProfile?.uid,
          approvedByUserId: undefined,
          activatedAt: undefined,
          createdAt: new Date().toISOString(),
          demoOnly: true,
          sourceCompetitionId: template.id,
        };
        const proposals = [next, ...demoProposals.filter((item) => item.id !== next.id)];
        setDemoProposals(proposals);
        storeDemoProposals(proposals);
        toast.success('Demo fantasy proposal prepared for Platform Admin review.');
        return;
      }
      if (!currentUser || typeof currentUser.getIdToken !== 'function') throw new Error('Sign in again before preparing fantasy.');
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/fantasy/admin', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action: 'propose', ...base }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Fantasy proposal could not be prepared.');
      toast.success('Fantasy proposal prepared for Platform Admin review.');
      setRemoteState(null);
      setRefreshKey((key) => key + 1);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Fantasy proposal could not be prepared.');
    } finally {
      setSaving(false);
    }
  }

  async function activateCompetition(competition: FantasyCompetition) {
    const readiness = state.readinessByCompetition[competition.id];
    if (!readiness?.ready) {
      toast.error('Readiness blockers must be cleared before activation.');
      return;
    }
    setSaving(true);
    try {
      if (isDemoMode) {
        const proposals = demoProposals.map((item) =>
          item.id === competition.id
            ? { ...item, status: 'active' as const, approvedByUserId: userProfile?.uid, activatedAt: new Date().toISOString() }
            : item,
        );
        setDemoProposals(proposals);
        storeDemoProposals(proposals);
        toast.success('Demo fantasy competition activated.');
        return;
      }
      if (!currentUser || typeof currentUser.getIdToken !== 'function') throw new Error('Sign in again before activating fantasy.');
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/fantasy/admin', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action: 'activate', competitionId: competition.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Fantasy competition could not be activated.');
      toast.success('Fantasy competition activated.');
      setRemoteState(null);
      setRefreshKey((key) => key + 1);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Fantasy competition could not be activated.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="min-w-0 max-w-full overflow-hidden p-4" data-testid="fantasy-launch-control">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
            <RocketLaunch className="h-4 w-4" weight="bold" />
            Fantasy launch control
          </p>
          <h2 className="mt-1 text-[15px] font-semibold text-text-strong">
            {mode === 'platform' ? 'Review and activate free fantasy' : 'Prepare free fantasy for review'}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
            Activation checks roster size, round coverage, prices, position groups, and recorded stat coverage before any public competition can go live.
          </p>
        </div>
        <div className="grid w-full grid-cols-3 gap-2 text-center sm:w-auto sm:min-w-[260px]">
          <LaunchStat label="Launches" value={competitions.length} />
          <LaunchStat label="Ready" value={readyCount} tone={readyCount ? 'good' : 'neutral'} />
          <LaunchStat label="Pending" value={actionable.length} tone={actionable.length ? 'warn' : 'neutral'} />
        </div>
      </div>

      <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-subtle">
            League
            <select
              value={activeSelectedLeague?.id ?? ''}
              onChange={(event) => setSelectedLeagueId(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong outline-none focus:border-brand"
              disabled={Boolean(league)}
            >
              {visibleLeagues.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <LaunchStat label="Season" value={season ? 1 : 0} tone={season ? 'good' : 'warn'} />
            <LaunchStat label="Rules" value={profile && rules ? 1 : 0} tone={profile && rules ? 'good' : 'warn'} />
          </div>
          {mode === 'league' ? (
            <div className="space-y-3 pt-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-subtle">
                Data level
                <select
                  value={dataLevel}
                  onChange={(event) => {
                    const next = event.target.value as FantasyDataLevel;
                    setDataLevel(next);
                    if (!recordedKeys.trim()) setRecordedKeys(profile ? defaultRecordedKeys(profile, next) : '');
                  }}
                  className="mt-1.5 h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong outline-none focus:border-brand"
                >
                  <option value="basic">Basic</option>
                  <option value="standard">Standard</option>
                  <option value="advanced">Advanced</option>
                </select>
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-subtle">
                Recorded stat keys
                <textarea
                  value={recordedKeys}
                  placeholder={effectiveRecordedKeys}
                  onChange={(event) => setRecordedKeys(event.target.value)}
                  className="mt-1.5 min-h-24 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 py-2 text-sm text-text-strong outline-none focus:border-brand"
                />
              </label>
              <Button data-testid="fantasy-prepare-proposal" block icon={RocketLaunch} onClick={() => void proposeCompetition()} disabled={saving || !canPropose}>
                {saving ? 'Preparing...' : 'Prepare proposal'}
              </Button>
            </div>
          ) : (
            <div className="rounded-[var(--radius-sm)] border border-border bg-surface-1 p-3 text-xs leading-5 text-muted">
              Platform activation publishes prices, marks the competition active, and writes an immutable fantasy audit event.
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-2">
          {loading ? (
            <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-4 text-sm text-muted">Loading fantasy launch state...</div>
          ) : competitions.length ? competitions.map((competition) => {
            const readiness = state.readinessByCompetition[competition.id];
            const tone = statusTone(competition.status);
            return (
              <div key={competition.id} data-testid={`fantasy-launch-${competition.id}`} className="min-w-0 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-text-strong">{competition.name}</h3>
                      <StatusPill label={toDisplayStatus(competition.status)} tone={tone} />
                      {(competition as DemoCompetition).demoOnly ? <StatusPill label="demo" tone="neutral" /> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {competition.sport} · {competition.dataLevel} data · {readiness?.summary.playerCount ?? 0} players · {readiness?.summary.roundCount ?? 0} rounds
                    </p>
                  </div>
                  {mode === 'platform' && ['proposed', 'approved'].includes(competition.status) ? (
                    <Button data-testid={`fantasy-activate-${competition.id}`} size="sm" icon={ShieldCheck} onClick={() => void activateCompetition(competition)} disabled={saving || !readiness?.ready}>
                      Activate
                    </Button>
                  ) : readiness?.ready ? (
                    <CheckCircle className="h-6 w-6 shrink-0 text-[var(--state-verified)]" weight="fill" />
                  ) : (
                    <Warning className="h-6 w-6 shrink-0 text-[var(--state-pending)]" weight="fill" />
                  )}
                </div>
                {!readiness?.ready ? (
                  <div className="mt-3 space-y-1 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--state-pending),transparent_55%)] bg-[color-mix(in_srgb,var(--state-pending),transparent_90%)] p-3">
                    {(readiness?.blockers ?? ['Readiness has not been calculated.']).slice(0, 4).map((blocker) => (
                      <p key={blocker} className="text-xs leading-5 text-text-strong">{blocker}</p>
                    ))}
                  </div>
                ) : readiness.warnings.length ? (
                  <p className="mt-3 text-xs leading-5 text-muted">{readiness.warnings.slice(0, 2).join(' ')}</p>
                ) : null}
              </div>
            );
          }) : (
            <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-4 text-sm text-muted">
              No fantasy competition has been proposed for this league yet.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function LaunchStat({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'good' | 'warn' | 'neutral' }) {
  return (
    <div className={cn(
      'rounded-[var(--radius-sm)] border px-2 py-2',
      tone === 'good' && 'border-[color-mix(in_srgb,var(--state-verified),transparent_55%)] bg-brand-subtle',
      tone === 'warn' && 'border-[color-mix(in_srgb,var(--state-pending),transparent_55%)] bg-[color-mix(in_srgb,var(--state-pending),transparent_90%)]',
      tone === 'neutral' && 'border-border bg-surface-3',
    )}>
      <p data-numeric className="text-sm font-bold tabular-nums text-text-strong">{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">{label}</p>
    </div>
  );
}

function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: 'good' | 'warn' | 'neutral' }) {
  return (
    <span className={cn(
      'rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize',
      tone === 'good' && 'bg-brand-subtle text-brand',
      tone === 'warn' && 'bg-[color-mix(in_srgb,var(--state-pending),transparent_84%)] text-[var(--state-pending)]',
      tone === 'neutral' && 'bg-surface-3 text-muted',
    )}>
      {label}
    </span>
  );
}
