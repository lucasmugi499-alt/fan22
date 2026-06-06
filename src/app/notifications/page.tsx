'use client';

import React, { useEffect, useState } from 'react';
import { Notification01Icon } from 'hugeicons-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PageContainer, SectionHeader } from '@/components/ui/product';
import { useAuth } from '@/context/AuthProvider';
import { dataProvider } from '@/data/dataProvider';
import { Notification } from '@/types';

export default function NotificationsPage() {
  const { currentUser, userProfile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const userId = currentUser?.uid ?? userProfile?.uid;
    if (!userId) return;
    let cancelled = false;
    dataProvider.getNotificationsByUser(userId).then((items) => {
      if (!cancelled) setNotifications(items);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.uid, userProfile?.uid]);

  return (
    <ProtectedRoute>
      <PageContainer compact>
        <SectionHeader eyebrow="Notifications" title="Activity updates" />
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div key={notification.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start gap-3">
                <Notification01Icon className="mt-1 size-4 text-[var(--goal-mint)]" />
                <div>
                  <p className="font-display text-lg font-black text-white">{notification.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">{notification.body}</p>
                </div>
              </div>
            </div>
          ))}
          {!notifications.length && (
            <div className="glass-panel rounded-xl p-5 text-sm text-slate-300">No notifications yet.</div>
          )}
        </div>
      </PageContainer>
    </ProtectedRoute>
  );
}
