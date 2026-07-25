'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { SealCheck, Warning, XCircle, ShieldCheck } from '@phosphor-icons/react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/lib/store';
import { MatchStatusBadge } from '@/components/ui/StatusBadge';
import type { Match, Team } from '@/types';

/**
 * League adjudication of a result exception. The league decides (uphold, correct, reject);
 * the trusted finalizer is what stamps a result official. In demo mode this writes local
 * state; in Firebase the finalizer performs the promotion once the league has resolved.
 */
export function LeagueResolveSheet({
  open,
  onClose,
  match,
  home,
  away,
}: {
  open: boolean;
  onClose: () => void;
  match: Match;
  home?: Team;
  away?: Team;
}) {
  const updateDemoMatch = useAppStore((s) => s.updateDemoMatch);
  const [busy, setBusy] = useState(false);
  const homeName = home?.name ?? 'Home';
  const awayName = away?.name ?? 'Away';

  function finalize() {
    setBusy(true);
    toast('Resolved. Sending to GoalPlace256 to finalize.');
    setTimeout(() => {
      updateDemoMatch(match.id, { status: 'completed', verificationStatus: 'verified' });
      toast.success('Finalized as the official result.');
      setBusy(false);
      onClose();
    }, 1000);
  }
  function keepDisputed() {
    updateDemoMatch(match.id, { verificationStatus: 'disputed' });
    toast('Kept under dispute for further review.');
    onClose();
  }
  function reject() {
    updateDemoMatch(match.id, { verificationStatus: 'rejected' });
    toast('Result rejected. A fresh submission can replace it.');
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Resolve result"
      description={`${homeName} vs ${awayName}`}
      footer={
        <div className="space-y-2">
          <Button block icon={SealCheck} onClick={finalize} disabled={busy}>
            {busy ? 'Finalizing...' : 'Uphold and finalize'}
          </Button>
          <div className="flex gap-2">
            <Button block variant="secondary" icon={Warning} onClick={keepDisputed} disabled={busy}>
              Keep disputed
            </Button>
            <Button block variant="secondary" icon={XCircle} onClick={reject} disabled={busy}>
              Reject
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Current state</span>
          <MatchStatusBadge match={match} size="sm" />
        </div>
        <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-4">
          <Row name={homeName} score={match.score.home} />
          <div className="my-2 h-px bg-border" />
          <Row name={awayName} score={match.score.away} />
        </div>
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm text-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" weight="bold" />
          <p>
            The league does not verify every normal result. It rules on the exceptions. Upholding
            settles the two-sided check, then GoalPlace256 finalizes the official record.
          </p>
        </div>
      </div>
    </Sheet>
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
