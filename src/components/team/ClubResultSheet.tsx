'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Sheet } from '@/components/ui/Sheet';
import { useAuth } from '@/context/AuthProvider';
import { isOfficialMatch } from '@/lib/status';
import type { Match, Team } from '@/types';
import { cn } from '@/lib/utils';

/**
 * What a club can do about a result. Two things, and neither is "set it".
 *
 * This replaces `ResultSubmissionSheet`, the V1 bilateral flow in which a club submitted a
 * score and its opponent confirmed or disputed it, and agreement made it official. ADR-005 is
 * explicit that this must not come back: two clubs agreeing is not evidence a match went a
 * particular way, it is evidence two clubs agree.
 *
 *   Field Manager captures. League governs. Clubs report and dispute. GoalPlace finalizes.
 *
 * So the sheet has two modes and the match decides which:
 *
 * - **Played, not yet official** — the club gives its account: a score it saw, notes, and
 *   photos through the evidence flow. That lands in `teamMatchReports`, which a League Admin
 *   may weigh and the finalizer never reads.
 * - **Official** — the club opens a result case against the exact version it is looking at.
 *   The case model does the rest, and the club's own account is the first piece of evidence.
 *
 * Nothing here writes `matches`, `resultSubmissions` or anything a finalizer consumes.
 */
export function ClubResultSheet({
  match,
  team,
  opponent,
  onClose,
  onDone,
}: {
  match: Match | null;
  team: Team;
  opponent: Team | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const { currentUser, isDemoMode } = useAuth();
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const official = match ? isOfficialMatch(match) : false;
  const isHome = match?.homeTeamId === team.id;
  const ready = notes.trim().length >= 10 && (official || (home === '' && away === '') || (home !== '' && away !== ''));

  async function submit() {
    if (!match) return;
    if (isDemoMode || !currentUser) {
      toast.error('A demo session cannot report on a real match.');
      return;
    }
    setSubmitting(true);
    try {
      const token = await currentUser.getIdToken();
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };

      if (official) {
        // A dispute is a result case, opened against the version the club is looking at so a
        // stale page cannot challenge a result that has since been superseded.
        const response = await fetch(`/api/matches/${encodeURIComponent(match.id)}/result-cases`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            subjectVersion: (match as { officialResultVersion?: number }).officialResultVersion ?? 0,
            reason: notes.trim(),
            evidence: [],
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? 'The case could not be opened.');
        toast.success('Case opened. Your league will adjudicate it.');
      } else {
        const response = await fetch(`/api/matches/${encodeURIComponent(match.id)}/team-report`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            teamId: team.id,
            ...(home !== '' && away !== '' ? { declaredScore: { home: Number(home), away: Number(away) } } : {}),
            notes: notes.trim(),
            evidenceRefs: [],
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? 'The report could not be recorded.');
        toast.success(body.revisions > 1 ? 'Your account was updated.' : 'Your account was recorded.');
      }
      setHome(''); setAway(''); setNotes('');
      onDone();
      onClose();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  const homeName = isHome ? team.name : opponent?.name ?? 'Home';
  const awayName = isHome ? opponent?.name ?? 'Away' : team.name;

  return (
    <Sheet
      open={Boolean(match)}
      onClose={onClose}
      mobileFullScreen
      title={official ? 'Dispute this result' : 'Your account of this match'}
      description={official
        ? 'The result is official. If it is wrong, a case is opened and your league rules on it. Nothing is edited.'
        : 'What your club saw. This is evidence your league can weigh; it does not set the result.'}
    >
      <div className="space-y-4">
        {match ? (
          <p className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm text-text">
            <span className="font-semibold text-text-strong">{homeName}</span>
            <span className="mx-2 text-subtle">v</span>
            <span className="font-semibold text-text-strong">{awayName}</span>
            {official && match.score ? (
              <span className="ml-2 tabular-nums text-muted">
                — official {match.score.home}–{match.score.away}
              </span>
            ) : null}
          </p>
        ) : null}

        {!official ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-text">
              {homeName}
              <input
                type="number" min={0} max={500} inputMode="numeric" value={home}
                onChange={(event) => setHome(event.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong"
              />
            </label>
            <label className="block text-sm font-medium text-text">
              {awayName}
              <input
                type="number" min={0} max={500} inputMode="numeric" value={away}
                onChange={(event) => setAway(event.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 text-sm text-text-strong"
              />
            </label>
            <p className="col-span-2 -mt-1 text-xs leading-5 text-muted">
              Optional. The score as your club saw it — leave both blank if you are only adding notes.
            </p>
          </div>
        ) : null}

        <label className="block text-sm font-medium text-text">
          {official ? 'What is wrong with the result?' : 'Notes'}
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={official
              ? 'The second goal was credited to the wrong club.'
              : 'Kickoff was delayed twenty minutes. Our number 9 was sent off in the 70th.'}
            className="mt-1.5 min-h-28 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 p-3 text-sm text-text-strong placeholder:text-subtle"
          />
          <span className="mt-1.5 block text-xs leading-5 text-muted">
            {official
              ? 'Recorded on the case for your league and, if it is escalated, for the platform.'
              : 'Photos of the scoreboard or team sheet can be attached from the match page once your account is recorded.'}
          </span>
        </label>

        <button
          type="button"
          disabled={!ready || submitting}
          onClick={() => void submit()}
          className={cn(
            'min-h-11 w-full rounded-[var(--radius-md)] px-4 text-sm font-semibold transition',
            ready && !submitting
              ? 'bg-brand text-[var(--on-brand)] hover:bg-brand-hover'
              : 'cursor-not-allowed bg-surface-3 text-subtle',
          )}
        >
          {submitting ? 'Sending…' : official ? 'Open a case' : 'Record our account'}
        </button>
      </div>
    </Sheet>
  );
}
