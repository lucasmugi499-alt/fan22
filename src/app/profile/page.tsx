'use client';

import React from 'react';
import { User } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PageContainer, SectionHeader } from '@/components/ui/product';
import { useAuth } from '@/context/AuthProvider';

export default function ProfilePage() {
  const { userProfile, role } = useAuth();

  return (
    <ProtectedRoute>
      <PageContainer compact>
        <SectionHeader eyebrow="Profile" title={userProfile?.name ?? 'GoalPlace256 profile'} />
        <div className="glass-panel rounded-xl p-5">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-xl border border-[var(--goal-emerald)]/30 bg-[var(--goal-emerald)]/12 text-[var(--goal-mint)]">
              <User className="size-7" />
            </div>
            <div>
              <p className="font-heading text-2xl font-black text-white">{userProfile?.name ?? 'Demo User'}</p>
              <p className="mt-1 text-sm text-slate-400">{userProfile?.email ?? 'demo@goalplace256.com'} - {role ?? 'fan'}</p>
            </div>
          </div>
        </div>
      </PageContainer>
    </ProtectedRoute>
  );
}
