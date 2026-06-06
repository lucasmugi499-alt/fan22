'use client';

import React from 'react';
import { Settings01Icon } from 'hugeicons-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PageContainer, SectionHeader } from '@/components/ui/product';
import { useAuth } from '@/context/AuthProvider';

export default function SettingsPage() {
  const { firebaseReady, isDemoMode } = useAuth();

  return (
    <ProtectedRoute>
      <PageContainer compact>
        <SectionHeader eyebrow="Settings" title="Account settings" />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="glass-panel rounded-xl p-5">
            <Settings01Icon className="mb-3 size-5 text-[var(--goal-mint)]" />
            <p className="font-display text-xl font-black text-white">Data mode</p>
            <p className="mt-2 text-sm text-slate-400">{firebaseReady && !isDemoMode ? 'Firebase ready' : 'Demo/mock mode'}</p>
          </div>
          <div className="glass-panel rounded-xl p-5">
            <p className="font-display text-xl font-black text-white">Payments</p>
            <p className="mt-2 text-sm text-slate-400">No real payments are processed in this build.</p>
          </div>
        </div>
      </PageContainer>
    </ProtectedRoute>
  );
}
