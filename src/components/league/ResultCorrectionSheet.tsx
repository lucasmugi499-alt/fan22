'use client';

import { useState } from 'react';
import { Check, GitDiff } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthProvider';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import type { Match, ResultSubmission, Team } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Sheet } from '@/components/ui/Sheet';

export function ResultCorrectionSheet({
  submission,
  match,
  home,
  away,
  onClose,
  onComplete,
}: {
  submission: ResultSubmission | null;
  match?: Match;
  home?: Team;
  away?: Team;
  onClose: () => void;
  onComplete: () => void;
}) {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [homeScore, setHomeScore] = useState(String(match?.score.home ?? submission?.homeScore ?? 0));
  const [awayScore, setAwayScore] = useState(String(match?.score.away ?? submission?.awayScore ?? 0));
  const [reason, setReason] = useState(submission?.correctionReason ?? '');
  const [saving, setSaving] = useState(false);

  if (!submission) return null;
  const selectedSubmission = submission;

  async function approve() {
    const actorUserId = currentUser?.uid ?? userProfile?.uid;
    if (!actorUserId || reason.trim().length < 10) {
      toast.error('Record the evidence basis for this correction.');
      return;
    }
    setSaving(true);
    try {
      const result = await provider.approveResultCorrection({
        matchId: selectedSubmission.matchId,
        actorUserId,
        homeScore: Number(homeScore),
        awayScore: Number(awayScore),
        reason: reason.trim(),
      });
      toast.success(result.message ?? 'Corrected result finalized.');
      onComplete();
      onClose();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'The correction could not be finalized.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Review official correction"
      description={`${home?.name ?? 'Home'} vs ${away?.name ?? 'Away'} · current version ${submission.resultVersion}`}
      footer={<Button block icon={Check} onClick={approve} disabled={saving}>{saving ? 'Finalizing...' : 'Approve corrected version'}</Button>}
    >
      <div className="space-y-4">
        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-text-strong"><GitDiff className="h-4 w-4 text-brand" /> Existing official score</p>
          <p data-numeric className="mt-3 text-3xl font-bold tabular-nums text-text-strong">{match?.score.home ?? submission.homeScore} - {match?.score.away ?? submission.awayScore}</p>
          <p className="mt-2 text-xs text-muted">The existing version stays in the immutable version history.</p>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold uppercase text-subtle">{home?.name ?? 'Home'}<input className="field mt-2 normal-case" type="number" min="0" value={homeScore} onChange={(event) => setHomeScore(event.target.value)} /></label>
          <label className="block text-xs font-semibold uppercase text-subtle">{away?.name ?? 'Away'}<input className="field mt-2 normal-case" type="number" min="0" value={awayScore} onChange={(event) => setAwayScore(event.target.value)} /></label>
        </div>
        <label className="block text-xs font-semibold uppercase text-subtle">
          Correction ruling
          <textarea className="field mt-2 min-h-28 py-3 normal-case" value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <p className="text-xs leading-5 text-muted">Corrections more than 72 hours after finalization require Platform Admin approval. The trusted finalizer updates the public score and preserves the superseded version.</p>
      </div>
    </Sheet>
  );
}
