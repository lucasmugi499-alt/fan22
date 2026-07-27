'use client';

import Link from 'next/link';
import { BellSimple, SealCheck, HandCoins, Trophy, UserCirclePlus, Megaphone } from '@phosphor-icons/react';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import type { IconComponent } from '@/lib/icons';
import type { Notification } from '@/types';
import { useAuth } from '@/context/AuthProvider';
import { useUserNotifications } from '@/lib/firebase/useGoalPlaceData';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { Skeleton } from '@/components/ui/Skeleton';

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

const GROUP_ORDER = ['Matchday', 'Athletes and support', 'Operations', 'Community'] as const;

function notificationGroup(type?: string): (typeof GROUP_ORDER)[number] {
  if (type?.includes('match') || type?.includes('result')) return 'Matchday';
  if (type?.includes('support') || type?.includes('pledge') || type?.includes('challenge') || type?.includes('athlete')) {
    return 'Athletes and support';
  }
  if (type?.includes('approval') || type?.includes('dispute') || type?.includes('roster') || type?.includes('notice')) {
    return 'Operations';
  }
  return 'Community';
}

export function NotificationsList() {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const userId = currentUser?.uid ?? userProfile?.uid;
  const provider = isDemoMode ? mockProvider : dataProvider;
  const { items: list, loading, retry } = useUserNotifications(userId);

  async function markRead(notification: Notification) {
    if (notification.read) return;
    await provider.markNotificationRead(notification.id);
    retry();
  }

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-8 w-48" />{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16 w-full rounded-[var(--radius-md)]" />)}</div>;
  }
  const unreadCount = list.filter((notification) => !notification.read).length;
  const grouped = GROUP_ORDER
    .map((name) => ({ name, items: list.filter((notification) => notificationGroup(notification.type) === name) }))
    .filter((group) => group.items.length);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text-strong">Notifications</h1>
        <p className="text-sm text-muted">{unreadCount ? `${unreadCount} unread · ` : ''}Whose turn it is to act, and what changed.</p>
      </div>

      {list.length ? (
        <div className="space-y-5">
          {grouped.map((group) => (
            <section key={group.name} aria-labelledby={`notifications-${group.name.replaceAll(' ', '-').toLowerCase()}`}>
              <h2 id={`notifications-${group.name.replaceAll(' ', '-').toLowerCase()}`} className="mb-2 text-xs font-semibold uppercase text-subtle">
                {group.name}
              </h2>
              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core">
                {group.items.map((n) => {
                  const Icon = ICON[n.type ?? ''] ?? BellSimple;
                  const row = (
                    <div onClick={() => void markRead(n)} className={cn('flex items-start gap-3 border-b border-border p-3.5 last:border-0', !n.read && 'bg-brand-subtle/40')}>
                      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full', n.read ? 'bg-surface-3 text-muted' : 'bg-brand-subtle text-brand')}>
                        <Icon className="h-4 w-4" weight="bold" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-strong">{n.title}</p>
                        <p className="text-xs text-muted">{n.body}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!n.read ? <span className="h-2 w-2 rounded-full bg-brand" aria-label="Unread" /> : null}
                        <span className="text-[11px] text-subtle">{timeAgo(n.createdAt)}</span>
                      </div>
                    </div>
                  );
                  return n.href ? <Link key={n.id} href={n.href} className="block hover:bg-surface-2/50">{row}</Link> : <button type="button" key={n.id} className="block w-full text-left">{row}</button>;
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState icon={BellSimple} title="You are all caught up" description="New activity on your matches, support and verifications will show here." />
      )}
    </div>
  );
}
