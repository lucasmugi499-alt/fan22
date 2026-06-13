'use client';

import React from 'react';
import { Notification01Icon, SecurityCheckIcon, Settings01Icon, Shield01Icon } from 'hugeicons-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { DataCard, PageContainer, SectionHeader, StatusExplainerChip } from '@/components/ui/product';
import { useAuth } from '@/context/AuthProvider';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { firebaseReady, isDemoMode, role } = useAuth();
  const roleLabel = (role ?? 'fan').replace('_', ' ');
  const save = (label: string) => toast.success(`${label} saved in demo mode.`);

  return (
    <ProtectedRoute>
      <PageContainer compact className="space-y-6">
        <SectionHeader eyebrow="Settings" title="Account settings" description={`Configure the current ${roleLabel} workspace.`} />
        <div className="grid gap-3 md:grid-cols-2">
          <DataCard>
            <Settings01Icon className="mb-3 size-5 text-[var(--goal-mint)]" />
            <p className="font-display text-xl font-black text-white">Data mode</p>
            <p className="mt-2 text-sm text-slate-400">{firebaseReady && !isDemoMode ? 'Firebase ready' : 'Demo/mock mode'}</p>
            <div className="mt-4">
              <StatusExplainerChip domain="system" status={firebaseReady && !isDemoMode ? 'Verified' : 'Draft'} showDetail />
            </div>
          </DataCard>
          <DataCard>
            <SecurityCheckIcon className="mb-3 size-5 text-[var(--goal-mint)]" />
            <p className="font-display text-xl font-black text-white">Payments</p>
            <p className="mt-2 text-sm text-slate-400">No real payments are processed in this build. Demo support records use mock writes and visible toasts.</p>
          </DataCard>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <DataCard>
            <Notification01Icon className="mb-3 size-5 text-[var(--goal-gold)]" />
            <h2 className="font-display text-lg font-black text-white">Notifications</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Match updates, verification decisions, support activity, and admin queue reminders.</p>
            <Button className="mt-4 w-full" variant="outline" onClick={() => save('Notification preferences')}>Save Notification Preferences</Button>
          </DataCard>
          <DataCard>
            <Shield01Icon className="mb-3 size-5 text-[var(--goal-mint)]" />
            <h2 className="font-display text-lg font-black text-white">Privacy</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Control public profile details, saved posts, and support visibility for the active role.</p>
            <Button className="mt-4 w-full" variant="outline" onClick={() => save('Privacy settings')}>Save Privacy Settings</Button>
          </DataCard>
          <DataCard>
            <Settings01Icon className="mb-3 size-5 text-blue-300" />
            <h2 className="font-display text-lg font-black text-white">Role Workspace</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Active role permissions control which dashboard, buttons, and verification queues are visible.</p>
            <Button className="mt-4 w-full" variant="outline" onClick={() => save('Role workspace settings')}>Save Role Workspace</Button>
          </DataCard>
        </div>
      </PageContainer>
    </ProtectedRoute>
  );
}
