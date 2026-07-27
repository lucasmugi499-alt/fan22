'use client';

import { useState } from 'react';
import { Check, Megaphone } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthProvider';
import { useAuthGate } from '@/components/auth/AuthRequiredModal';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import type { LeagueNotice } from '@/types';

export function LeagueNoticeList({ notices }: { notices: LeagueNotice[] }) {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const { requireAuth } = useAuthGate();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [read, setRead] = useState<Set<string>>(() => new Set());

  function acknowledge(notice: LeagueNotice) {
    requireAuth(async () => {
      const userId = currentUser?.uid ?? userProfile?.uid;
      if (!userId || read.has(notice.id)) return;
      setRead((current) => new Set(current).add(notice.id));
      try {
        const result = await provider.recordPointsAction({
          userId,
          actionType: 'league_notice_read',
          relatedEntityId: notice.id,
        });
        toast.success(result.message ?? 'Notice acknowledged.');
      } catch (cause) {
        setRead((current) => {
          const next = new Set(current);
          next.delete(notice.id);
          return next;
        });
        toast.error(cause instanceof Error ? cause.message : 'The notice could not be acknowledged.');
      }
    }, 'Sign in to acknowledge league notices and earn participation recognition.');
  }

  return (
    <div className="mt-3 space-y-3">
      {notices.map((notice) => (
        <article key={notice.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-strong">{notice.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{notice.message}</p>
            </div>
            <button
              type="button"
              onClick={() => acknowledge(notice)}
              disabled={read.has(notice.id)}
              className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-[var(--radius-md)] border border-border px-2.5 text-xs font-semibold text-muted hover:border-brand hover:text-brand disabled:text-verified"
            >
              {read.has(notice.id) ? <Check className="h-3.5 w-3.5" weight="bold" /> : <Megaphone className="h-3.5 w-3.5" />}
              {read.has(notice.id) ? 'Read' : 'Acknowledge'}
            </button>
          </div>
        </article>
      ))}
      {!notices.length ? <p className="text-sm text-muted">No active notices.</p> : null}
    </div>
  );
}
