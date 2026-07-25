'use client';

import Link from 'next/link';
import { BellSimple, SealCheck, HandCoins, Trophy, UserCirclePlus, Megaphone } from '@phosphor-icons/react';
import { notifications } from '@/data/mockNotifications';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import type { IconComponent } from '@/lib/icons';
import type { Notification } from '@/types';

const ICON: Record<string, IconComponent> = {
  support_received: HandCoins,
  pledge_created: HandCoins,
  challenge_verified: SealCheck,
  match_result_verified: SealCheck,
  athlete_followed: UserCirclePlus,
  sponsor_campaign_update: Megaphone,
  awards_ranking_update: Trophy,
};

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const mins = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

export function NotificationsList() {
  const list = notifications as Notification[];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text-strong">Notifications</h1>
        <p className="text-sm text-muted">Whose turn it is to act, and what changed.</p>
      </div>

      {list.length ? (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core">
          {list.map((n) => {
            const Icon = ICON[n.type ?? ''] ?? BellSimple;
            const row = (
              <div className={cn('flex items-start gap-3 border-b border-border p-3.5 last:border-0', !n.read && 'bg-brand-subtle/40')}>
                <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full', n.read ? 'bg-surface-3 text-muted' : 'bg-brand-subtle text-brand')}>
                  <Icon className="h-4 w-4" weight="bold" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-strong">{n.title}</p>
                  <p className="text-xs text-muted">{n.body}</p>
                </div>
                <span className="shrink-0 text-[11px] text-subtle">{timeAgo(n.createdAt)}</span>
              </div>
            );
            return n.href ? <Link key={n.id} href={n.href} className="block hover:bg-surface-2/50">{row}</Link> : <div key={n.id}>{row}</div>;
          })}
        </div>
      ) : (
        <EmptyState icon={BellSimple} title="You are all caught up" description="New activity on your matches, support and verifications will show here." />
      )}
    </div>
  );
}
