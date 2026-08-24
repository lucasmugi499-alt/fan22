'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Clock,
  PaperPlaneTilt,
  SealCheck,
  ShieldCheck,
  Warning,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle,
  UserCircle,
} from '@phosphor-icons/react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthProvider';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { canSubmitResultFor } from '@/lib/resultSubmission';
import { isOfficialMatch } from '@/lib/status';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { uploadMatchEvidence } from '@/lib/firebase/storage';
import {
  clearQueuedResultDraft,
  privateCacheNamespace,
  queueResultDraft,
  readQueuedResultDraft,
} from '@/lib/offline';
import type { AthleteStatLine, Match, ResultSubmission, ScorerEntry, SportSlug, Team } from '@/types';

type Stage = 'idle' | 'saving' | 'finalizing';
type Mode = 'submit' | 'respond' | 'waiting' | 'review' | 'view';

/**
 * The result trust chain. A team admin may SUBMIT a score
 * (for a played match with no result) or, when the opponent has submitted, CONFIRM or
 * DISPUTE it. The client never writes `official`: confirming hands off to the trusted
 * finalizer, which stamps the result and updates the match atomically.
 */
export function ResultSubmissionSheet({
  open,
  onClose,
  onComplete,
  match,
  home,
  away,
  myTeamId,
}: {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
  match: Match;
  home?: Team;
  away?: Team;
  myTeamId: string;
}) {
  const { currentUser, userProfile, isDemoMode, role } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [homeScore, setHomeScore] = useState<string>(match.score.home?.toString() ?? '');
  const [awayScore, setAwayScore] = useState<string>(match.score.away?.toString() ?? '');
  const [submission, setSubmission] = useState<ResultSubmission>();
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [disputeReason, setDisputeReason] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [submitStep, setSubmitStep] = useState(0);
  const [scorerCounts, setScorerCounts] = useState<Record<string, number>>({});
  const [activeSquads, setActiveSquads] = useState<Record<string, string[]>>({});
  const [statLineInputs, setStatLineInputs] = useState<Record<string, Record<string, string>>>({});
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [evidenceNote, setEvidenceNote] = useState('');
  const [queued, setQueued] = useState(false);
  const [online, setOnline] = useState(true);
  const { athletes } = useGoalPlaceData({
    collections: ['athletes'],
    scope: { leagueId: match.leagueId },
    recordLimit: 250,
  });
  const actorUserId = currentUser?.uid ?? userProfile?.uid;
  const draftNamespace = useMemo(() => privateCacheNamespace({
    environment: process.env.NEXT_PUBLIC_GOALPLACE_ENVIRONMENT ?? process.env.NODE_ENV ?? 'local',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'unconfigured',
    databaseId: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID ?? '(default)',
    dataMode: isDemoMode ? 'mock' : 'firebase',
    uid: actorUserId ?? 'anonymous',
    role: role ?? 'team_admin',
    leagueId: match.leagueId,
    teamId: myTeamId,
  }), [actorUserId, isDemoMode, match.leagueId, myTeamId, role]);

  useEffect(
    () =>
      provider.subscribeToResultSubmission(
        match.id,
        (nextSubmission) => {
          setSubmission(nextSubmission);
          setLoaded(true);
          setLoadError(undefined);
        },
        (error) => {
          setLoaded(true);
          setLoadError(error.message);
        }
      ),
    [match.id, provider]
  );

  useEffect(() => {
    if (submission?.status !== 'official' || stage !== 'finalizing') return;
    toast.success('Finalized as the official result by GoalPlace256.');
    onComplete?.();
    onClose();
  }, [onClose, onComplete, stage, submission?.status]);

  useEffect(() => {
    let cancelled = false;
    readQueuedResultDraft(draftNamespace, match.id).then((draft) => {
      if (!draft || cancelled) return;
      setHomeScore(String(draft.input.homeScore));
      setAwayScore(String(draft.input.awayScore));
      setEvidenceFiles(draft.files);
      setEvidenceNote(draft.input.evidenceNote ?? '');
      setScorerCounts(Object.fromEntries((draft.input.scorers ?? []).map((item) => [item.athleteId, item.count])));
      setActiveSquads(draft.input.activeSquads ?? {});
      setStatLineInputs(statLineInputFromDraft(draft.input.athleteStatLines ?? []));
      setQueued(true);
    });
    return () => { cancelled = true; };
  }, [draftNamespace, match.id]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const initialCheck = window.setTimeout(() => setOnline(navigator.onLine), 0);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.clearTimeout(initialCheck);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    async function syncQueuedDraft() {
      if (!navigator.onLine || !actorUserId) return;
      const draft = await readQueuedResultDraft(draftNamespace, match.id);
      if (!draft) return;
      try {
        const evidenceRefs = isDemoMode
          ? draft.files.map((file) => `demo-evidence/${match.id}/${file.name}`)
          : await uploadMatchEvidence({
              matchId: match.id,
              teamId: myTeamId,
              userId: actorUserId,
              files: draft.files,
            });
        await provider.createResultSubmission({
          ...draft.input,
          evidenceRefs,
        });
        await clearQueuedResultDraft(draftNamespace, match.id);
        setQueued(false);
        toast.success('Your offline match report synced.');
        onComplete?.();
      } catch {
        // Keep the IndexedDB draft intact. The user can retry from this sheet.
      }
    }
    window.addEventListener('online', syncQueuedDraft);
    if (queued && navigator.onLine) void syncQueuedDraft();
    return () => window.removeEventListener('online', syncQueuedDraft);
  }, [actorUserId, draftNamespace, isDemoMode, match.id, myTeamId, onComplete, provider, queued]);

  const mode = useMemo<Mode>(() => {
    if (submission?.status === 'official' || (!submission && isOfficialMatch(match))) return 'view';
    if (!submission || ['rejected', 'withdrawn'].includes(submission.status)) return 'submit';
    if (submission.status === 'disputed') return 'review';
    if (submission.status === 'confirmed') return 'waiting';
    if (submission.submittedByTeamId === myTeamId) return 'waiting';
    return submission.opponentTeamId === myTeamId ? 'respond' : 'review';
  }, [match, myTeamId, submission]);

  const eligibleScorers = athletes.filter(
    (athlete) => athlete.teamId === match.homeTeamId || athlete.teamId === match.awayTeamId,
  );
  const homeAthletes = eligibleScorers.filter((athlete) => athlete.teamId === match.homeTeamId);
  const awayAthletes = eligibleScorers.filter((athlete) => athlete.teamId === match.awayTeamId);
  const sportSlug = normalizeSportSlug(match.sport);
  const statMetrics = sportStatMetrics(sportSlug);
  const normalizedActiveSquads = useMemo(() => {
    const normalizeTeam = (teamId: string, teamAthletes: typeof eligibleScorers) => {
      const selected = activeSquads[teamId];
      return selected ?? teamAthletes.map((athlete) => athlete.id);
    };
    return {
      [match.homeTeamId]: normalizeTeam(match.homeTeamId, homeAthletes),
      [match.awayTeamId]: normalizeTeam(match.awayTeamId, awayAthletes),
    };
  }, [activeSquads, awayAthletes, homeAthletes, match.awayTeamId, match.homeTeamId]);
  const scorers: ScorerEntry[] = Object.entries(scorerCounts)
    .filter(([, count]) => count > 0)
    .map(([athleteId, count]) => ({
      athleteId,
      teamId: athletes.find((athlete) => athlete.id === athleteId)?.teamId ?? myTeamId,
      count,
    }));
  const athleteStatLines = useMemo(() => buildAthleteStatLines({
    activeSquads: normalizedActiveSquads,
    athletes: eligibleScorers,
    inputs: statLineInputs,
    metrics: statMetrics,
  }), [eligibleScorers, normalizedActiveSquads, statLineInputs, statMetrics]);

  function toggleSquadAthlete(teamId: string, athleteId: string) {
    setActiveSquads((current) => {
      const teamAthletes = eligibleScorers
        .filter((athlete) => athlete.teamId === teamId)
        .map((athlete) => athlete.id);
      const selected = current[teamId] ?? teamAthletes;
      const nextSelected = selected.includes(athleteId)
        ? selected.filter((id) => id !== athleteId)
        : [...selected, athleteId];
      return { ...current, [teamId]: nextSelected };
    });
  }

  function updateStatLineInput(athleteId: string, statKey: string, value: string) {
    const normalized = value === '' ? '' : String(Math.max(0, Number(value) || 0));
    setStatLineInputs((current) => ({
      ...current,
      [athleteId]: {
        ...(current[athleteId] ?? {}),
        [statKey]: normalized,
      },
    }));
  }

  async function submit() {
    const h = Number(homeScore);
    const a = Number(awayScore);
    if (!Number.isFinite(h) || !Number.isFinite(a) || homeScore === '' || awayScore === '') {
      toast.error('Enter a score for both teams.');
      return;
    }
    if (!actorUserId) {
      toast.error('Your account is not ready to submit this result.');
      return;
    }
    setStage('saving');
    try {
      const input = {
        match,
        submittedByTeamId: myTeamId,
        submittedByUserId: actorUserId,
        homeScore: h,
        awayScore: a,
        scorers,
        activeSquads: normalizedActiveSquads,
        athleteStatLines,
        evidenceNote: evidenceNote.trim() || undefined,
      };
      if (!online) {
        await queueResultDraft(draftNamespace, match.id, {
          input,
          files: evidenceFiles,
          queuedAt: new Date().toISOString(),
        });
        setQueued(true);
        toast.success('Saved offline. This report will submit when connection returns.');
        onClose();
        return;
      }
      const evidenceRefs = isDemoMode
        ? evidenceFiles.map((file) => `demo-evidence/${match.id}/${file.name}`)
        : await uploadMatchEvidence({
            matchId: match.id,
            teamId: myTeamId,
            userId: actorUserId,
            files: evidenceFiles,
          });
      await provider.createResultSubmission({
        ...input,
        evidenceRefs,
      });
      await clearQueuedResultDraft(draftNamespace, match.id);
      setQueued(false);
      toast.success('Result submitted. The opposing team has 72 hours to respond.');
      onComplete?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The result could not be submitted.');
    } finally {
      setStage('idle');
    }
  }

  async function confirmResult() {
    if (!actorUserId) {
      toast.error('Your account is not ready to confirm this result.');
      return;
    }
    setStage('finalizing');
    try {
      await provider.confirmResultSubmission(match.id, actorUserId);
      toast('Confirmed. GoalPlace256 is finalizing the official record.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The result could not be confirmed.');
      setStage('idle');
    }
  }

  async function disputeResult() {
    if (!actorUserId) {
      toast.error('Your account is not ready to dispute this result.');
      return;
    }
    if (!disputeReason.trim()) {
      toast.error('Tell the league what is wrong with the submitted result.');
      return;
    }
    setStage('saving');
    try {
      await provider.disputeResultSubmission(match.id, actorUserId, disputeReason);
      toast('Dispute raised. The league will review it.');
      onComplete?.();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The dispute could not be submitted.');
      setStage('idle');
    }
  }

  async function retryFinalization() {
    setStage('finalizing');
    try {
      await provider.finalizeResultSubmission(match.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Finalization could not be retried.');
      setStage('idle');
    }
  }

  const title =
    mode === 'submit'
      ? 'Submit result'
      : mode === 'respond'
        ? 'Confirm the result'
        : mode === 'view'
          ? 'Official result'
          : mode === 'review'
            ? 'League review'
            : 'Awaiting confirmation';
  const homeName = home?.name ?? 'Home';
  const awayName = away?.name ?? 'Away';
  const score = submission
    ? {
        home: submission.correctedHomeScore ?? submission.homeScore,
        away: submission.correctedAwayScore ?? submission.awayScore,
      }
    : match.score;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={`${homeName} vs ${awayName}`}
      footer={
        mode === 'submit' ? (
          <div className="flex gap-2">
            {submitStep > 0 ? (
              <Button variant="secondary" icon={ArrowLeft} onClick={() => setSubmitStep((step) => step - 1)} disabled={stage !== 'idle'}>
                Back
              </Button>
            ) : null}
            {submitStep < 5 ? (
              <Button block iconTrailing={ArrowRight} onClick={() => setSubmitStep((step) => step + 1)} disabled={stage !== 'idle'}>
                Continue
              </Button>
            ) : (
              <Button
                block
                icon={PaperPlaneTilt}
                onClick={submit}
                disabled={stage !== 'idle' || !canSubmitResultFor(match)}
              >
                {stage === 'saving' ? 'Submitting...' : online ? 'Submit final report' : 'Save offline'}
              </Button>
            )}
          </div>
        ) : mode === 'respond' ? (
          <div className="flex gap-2">
            <Button variant="secondary" icon={Warning} onClick={disputeResult} disabled={stage !== 'idle'}>
              Dispute
            </Button>
            <Button block icon={SealCheck} onClick={confirmResult} disabled={stage !== 'idle'}>
              {stage === 'finalizing' ? 'Finalizing...' : 'Confirm'}
            </Button>
          </div>
        ) : mode === 'waiting' && submission?.status === 'confirmed' ? (
          <Button block icon={SealCheck} onClick={retryFinalization} disabled={stage !== 'idle'}>
            {stage === 'finalizing' ? 'Finalizing...' : 'Finalize now'}
          </Button>
        ) : null
      }
    >
      {!loaded ? (
        <p className="text-sm text-muted">Loading the result record...</p>
      ) : loadError ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--state-error)]/30 bg-[var(--state-error-bg)] p-3 text-sm text-[var(--state-error)]">
          {loadError}
        </div>
      ) : mode === 'submit' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-6 gap-1">
            {['Score', 'Squad', 'Scorers', 'Stats', 'Evidence', 'Preview'].map((label, index) => (
              <div key={label}>
                <div className={`h-1 rounded-full ${index <= submitStep ? 'bg-brand' : 'bg-surface-3'}`} />
                <p className={`mt-1 text-center text-[10px] ${index === submitStep ? 'text-brand' : 'text-subtle'}`}>{label}</p>
              </div>
            ))}
          </div>
          {queued ? (
            <div className="rounded-[var(--radius-md)] border border-warning/30 bg-[var(--state-warning-bg)] p-3 text-sm text-warning">
              An offline draft is saved for this match. Submitting replaces the queued copy.
            </div>
          ) : null}
          {submitStep === 0 ? (
            <>
              <p className="text-sm text-muted">Enter the final score. This remains a claim until the opponent confirms it.</p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <ScoreInput label={homeName} value={homeScore} onChange={setHomeScore} />
                <span className="pt-6 text-sm font-semibold text-subtle">vs</span>
                <ScoreInput label={awayName} value={awayScore} onChange={setAwayScore} />
              </div>
            </>
          ) : null}
          {submitStep === 1 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">Confirm the athletes who were in the match squad or appeared in the official report. These become official participation events only after verification.</p>
              <SquadSelector
                title={homeName}
                athletes={homeAthletes}
                selectedIds={normalizedActiveSquads[match.homeTeamId]}
                onToggle={(athleteId) => toggleSquadAthlete(match.homeTeamId, athleteId)}
              />
              <SquadSelector
                title={awayName}
                athletes={awayAthletes}
                selectedIds={normalizedActiveSquads[match.awayTeamId]}
                onToggle={(athleteId) => toggleSquadAthlete(match.awayTeamId, athleteId)}
              />
            </div>
          ) : null}
          {submitStep === 2 ? (
            <div>
              <p className="mb-3 flex items-center gap-2 text-sm text-muted"><UserCircle className="h-4 w-4 text-brand" /> Add scorers or point leaders where the match report includes them.</p>
              <div className="max-h-[48dvh] space-y-2 overflow-y-auto">
                {eligibleScorers.map((athlete) => (
                  <div key={athlete.id} className="flex min-h-12 items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3">
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-text-strong">{athlete.legalName}</span><span className="block text-xs text-muted">{athlete.registeredPosition}</span></span>
                    <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-surface-3 text-lg" onClick={() => setScorerCounts((items) => ({ ...items, [athlete.id]: Math.max(0, (items[athlete.id] ?? 0) - 1) }))}>-</button>
                    <span data-numeric className="w-5 text-center font-bold">{scorerCounts[athlete.id] ?? 0}</span>
                    <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-brand text-lg text-on-brand" onClick={() => setScorerCounts((items) => ({ ...items, [athlete.id]: (items[athlete.id] ?? 0) + 1 }))}>+</button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {submitStep === 3 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Add the extra official stats available on the match report. Leave unknown fields blank.
              </p>
              <StatLineEditor
                title={homeName}
                athletes={homeAthletes.filter((athlete) => normalizedActiveSquads[match.homeTeamId].includes(athlete.id))}
                metrics={statMetrics}
                values={statLineInputs}
                onChange={updateStatLineInput}
              />
              <StatLineEditor
                title={awayName}
                athletes={awayAthletes.filter((athlete) => normalizedActiveSquads[match.awayTeamId].includes(athlete.id))}
                metrics={statMetrics}
                values={statLineInputs}
                onChange={updateStatLineInput}
              />
            </div>
          ) : null}
          {submitStep === 4 ? (
            <div className="space-y-4">
              <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border-strong bg-surface-2 p-4 text-center">
                <Camera className="h-7 w-7 text-brand" weight="duotone" />
                <span className="mt-2 text-sm font-semibold text-text-strong">Add photo or video evidence</span>
                <span className="text-xs text-muted">Up to 15 MB each. Evidence cannot be replaced after submission.</span>
                <input type="file" accept="image/*,video/*" multiple className="sr-only" onChange={(event) => setEvidenceFiles([...event.target.files ?? []])} />
              </label>
              {evidenceFiles.length ? <p className="text-xs text-muted">{evidenceFiles.map((file) => file.name).join(', ')}</p> : null}
              <label className="block text-xs font-semibold uppercase text-subtle">Evidence note<textarea value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} rows={3} className="field mt-2 min-h-24 py-3 normal-case" placeholder="Referee notes, scorer details, or context for the opposing team." /></label>
            </div>
          ) : null}
          {submitStep === 5 ? (
            <div className="space-y-4">
              <ScoreLine
                homeName={homeName}
                awayName={awayName}
                h={homeScore === '' ? null : Number(homeScore)}
                a={awayScore === '' ? null : Number(awayScore)}
              />
              <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm text-muted">
                <p className="flex items-center gap-2 font-semibold text-text-strong"><CheckCircle className="h-4 w-4 text-brand" /> Final report preview</p>
                <p className="mt-2">{scorers.length} scorer entr{scorers.length === 1 ? 'y' : 'ies'} / {activeSquadCount(normalizedActiveSquads)} active-squad athletes / {athleteStatLines.length} stat line{athleteStatLines.length === 1 ? '' : 's'} / {evidenceFiles.length} evidence file{evidenceFiles.length === 1 ? '' : 's'}.</p>
                <p className="mt-1">Submitting confirms the match has ended. The score will not be official until the opposing Team Admin responds and the trusted finalizer completes.</p>
              </div>
            </div>
          ) : null}
        </div>
      ) : mode === 'respond' ? (
        <div className="space-y-4">
          <ScoreLine homeName={homeName} awayName={awayName} h={score.home} a={score.away} />
          <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm text-muted">
            <p className="flex items-center gap-2 font-medium text-text-strong">
              <ShieldCheck className="h-4 w-4 text-brand" weight="bold" />
              Confirming does not make it official
            </p>
            <p className="mt-1">
              Your confirmation settles the two-sided check. GoalPlace256 then finalizes the
              official result. If the score is wrong, dispute it and the league will decide.
            </p>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              Dispute reason
            </span>
            <textarea
              value={disputeReason}
              onChange={(event) => setDisputeReason(event.target.value)}
              rows={3}
              placeholder="Describe the incorrect score, scorer or match event."
              className="w-full resize-none rounded-[var(--radius-md)] border border-border-strong bg-surface-2 px-3 py-2.5 text-sm text-text-strong outline-none focus:border-brand"
            />
          </label>
        </div>
      ) : mode === 'waiting' ? (
        <div className="space-y-4">
          <ScoreLine homeName={homeName} awayName={awayName} h={score.home} a={score.away} />
          <p className="flex items-start gap-2 text-sm text-muted">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand" weight="bold" />
            {submission?.status === 'confirmed'
              ? 'Both sides have settled the result. GoalPlace256 is finalizing the official record.'
              : 'The opposing team can confirm or dispute this result before the deadline.'}
          </p>
        </div>
      ) : mode === 'review' ? (
        <div className="space-y-4">
          <ScoreLine homeName={homeName} awayName={awayName} h={score.home} a={score.away} />
          <p className="flex items-start gap-2 text-sm text-[var(--state-disputed)]">
            <Warning className="mt-0.5 h-4 w-4 shrink-0" weight="bold" />
            {submission?.disputeReason ?? 'This result is with the league for review.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <ScoreLine homeName={homeName} awayName={awayName} h={score.home} a={score.away} />
          <p className="flex items-center gap-2 text-sm text-[var(--state-verified)]">
            <SealCheck className="h-4 w-4" weight="fill" />
            Official. Counts toward standings and statistics.
          </p>
        </div>
      )}
    </Sheet>
  );
}

function ScoreInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block truncate text-xs font-medium text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-14 w-full rounded-[var(--radius-md)] border border-border-strong bg-surface-2 text-center text-2xl font-bold tabular-nums text-text-strong outline-none focus:border-brand"
      />
    </label>
  );
}

function ScoreLine({
  homeName,
  awayName,
  h,
  a,
}: {
  homeName: string;
  awayName: string;
  h: number | null;
  a: number | null;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-4">
      <Row name={homeName} score={h} />
      <div className="my-2 h-px bg-border" />
      <Row name={awayName} score={a} />
    </div>
  );
}

function Row({ name, score }: { name: string; score: number | null }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="truncate text-sm font-medium text-text-strong">{name}</span>
      <span data-numeric className="tabular text-xl font-bold tabular-nums text-text-strong">
        {score ?? '-'}
      </span>
    </div>
  );
}

function activeSquadCount(activeSquads: Record<string, string[]>) {
  return Object.values(activeSquads).reduce((total, ids) => total + ids.length, 0);
}

type StatMetric = {
  key: string;
  label: string;
  shortLabel: string;
};

function normalizeSportSlug(sport: Match['sport']): SportSlug {
  const normalized = String(sport).toLowerCase();
  if (normalized === 'basketball') return 'basketball';
  if (normalized === 'rugby') return 'rugby';
  return 'football';
}

function sportStatMetrics(sport: SportSlug): StatMetric[] {
  if (sport === 'basketball') {
    return [
      { key: 'minutes_played', label: 'Minutes played', shortLabel: 'Min' },
      { key: 'rebound', label: 'Rebounds', shortLabel: 'Reb' },
      { key: 'assist', label: 'Assists', shortLabel: 'Ast' },
      { key: 'steal', label: 'Steals', shortLabel: 'Stl' },
      { key: 'block', label: 'Blocks', shortLabel: 'Blk' },
      { key: 'turnover', label: 'Turnovers', shortLabel: 'TO' },
      { key: 'technical_foul', label: 'Technical fouls', shortLabel: 'Tech' },
      { key: 'ejection', label: 'Ejections', shortLabel: 'Ej' },
    ];
  }
  if (sport === 'rugby') {
    return [
      { key: 'minutes_played', label: 'Minutes played', shortLabel: 'Min' },
      { key: 'conversion', label: 'Conversions', shortLabel: 'Con' },
      { key: 'penalty_goal', label: 'Penalty goals', shortLabel: 'Pen' },
      { key: 'drop_goal', label: 'Drop goals', shortLabel: 'Drop' },
      { key: 'assist', label: 'Assists', shortLabel: 'Ast' },
      { key: 'yellow_card', label: 'Yellow cards', shortLabel: 'YC' },
      { key: 'red_card', label: 'Red cards', shortLabel: 'RC' },
    ];
  }
  return [
    { key: 'minutes_played', label: 'Minutes played', shortLabel: 'Min' },
    { key: 'assist', label: 'Assists', shortLabel: 'Ast' },
    { key: 'yellow_card', label: 'Yellow cards', shortLabel: 'YC' },
    { key: 'red_card', label: 'Red cards', shortLabel: 'RC' },
    { key: 'own_goal', label: 'Own goals', shortLabel: 'OG' },
  ];
}

function statLineInputFromDraft(lines: AthleteStatLine[]) {
  return Object.fromEntries(lines.map((line) => [
    line.athleteId,
    {
      ...(line.minutesPlayed ? { minutes_played: String(line.minutesPlayed) } : {}),
      ...Object.fromEntries(
        Object.entries(line.stats ?? {}).map(([key, value]) => [key, String(value)]),
      ),
    },
  ]));
}

function buildAthleteStatLines({
  activeSquads,
  athletes,
  inputs,
  metrics,
}: {
  activeSquads: Record<string, string[]>;
  athletes: Array<{ id: string; teamId: string }>;
  inputs: Record<string, Record<string, string>>;
  metrics: StatMetric[];
}) {
  const activeAthleteIds = new Set(Object.values(activeSquads).flat());
  const athleteById = new Map(athletes.map((athlete) => [athlete.id, athlete]));
  return Array.from(activeAthleteIds).flatMap((athleteId): AthleteStatLine[] => {
    const athlete = athleteById.get(athleteId);
    if (!athlete) return [];
    const input = inputs[athleteId] ?? {};
    const stats: Record<string, number> = {};
    let minutesPlayed: number | undefined;
    for (const metric of metrics) {
      const value = Number(input[metric.key] ?? 0);
      if (!Number.isFinite(value) || value <= 0) continue;
      const normalized = Math.trunc(value);
      if (metric.key === 'minutes_played') {
        minutesPlayed = normalized;
      } else {
        stats[metric.key] = normalized;
      }
    }
    if (!minutesPlayed && !Object.keys(stats).length) return [];
    return [{
      athleteId,
      teamId: athlete.teamId,
      ...(minutesPlayed ? { minutesPlayed } : {}),
      stats,
    }];
  });
}

function SquadSelector({
  title,
  athletes,
  selectedIds,
  onToggle,
}: {
  title: string;
  athletes: Array<{ id: string; legalName: string; registeredPosition: string }>;
  selectedIds: string[];
  onToggle: (athleteId: string) => void;
}) {
  return (
    <section className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="truncate text-sm font-semibold text-text-strong">{title}</h3>
        <span className="shrink-0 text-xs font-medium text-muted">{selectedIds.length} selected</span>
      </div>
      <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
        {athletes.length ? athletes.map((athlete) => {
          const selected = selectedIds.includes(athlete.id);
          return (
            <label
              key={athlete.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-surface-3"
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggle(athlete.id)}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-text-strong">{athlete.legalName}</span>
                <span className="block truncate text-xs text-muted">{athlete.registeredPosition}</span>
              </span>
            </label>
          );
        }) : (
          <p className="rounded-[var(--radius-sm)] border border-border bg-surface-1 px-3 py-2 text-xs text-muted">
            No athletes loaded for this team yet.
          </p>
        )}
      </div>
    </section>
  );
}

function StatLineEditor({
  title,
  athletes,
  metrics,
  values,
  onChange,
}: {
  title: string;
  athletes: Array<{ id: string; legalName: string; registeredPosition: string }>;
  metrics: StatMetric[];
  values: Record<string, Record<string, string>>;
  onChange: (athleteId: string, statKey: string, value: string) => void;
}) {
  return (
    <section className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="truncate text-sm font-semibold text-text-strong">{title}</h3>
        <span className="shrink-0 text-xs font-medium text-muted">{athletes.length} active</span>
      </div>
      <div className="max-h-[40dvh] space-y-3 overflow-y-auto pr-1">
        {athletes.length ? athletes.map((athlete) => (
          <div key={athlete.id} className="rounded-[var(--radius-sm)] border border-border bg-surface-1 p-2">
            <div className="mb-2 min-w-0">
              <p className="truncate text-sm font-medium text-text-strong">{athlete.legalName}</p>
              <p className="truncate text-xs text-muted">{athlete.registeredPosition}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {metrics.map((metric) => (
                <label key={metric.key} className="block text-[10px] font-semibold uppercase text-subtle" title={metric.label}>
                  {metric.shortLabel}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={values[athlete.id]?.[metric.key] ?? ''}
                    onChange={(event) => onChange(athlete.id, metric.key, event.target.value)}
                    className="mt-1 h-9 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface-2 px-2 text-center text-sm font-bold tabular-nums text-text-strong outline-none focus:border-brand"
                    aria-label={`${athlete.legalName} ${metric.label}`}
                  />
                </label>
              ))}
            </div>
          </div>
        )) : (
          <p className="rounded-[var(--radius-sm)] border border-border bg-surface-1 px-3 py-2 text-xs text-muted">
            Select active-squad athletes first.
          </p>
        )}
      </div>
    </section>
  );
}
