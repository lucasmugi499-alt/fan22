'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellSimple, CellSignalSlash, ShieldCheck, SignOut } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { IconComponent } from '@/lib/icons';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { toast } from 'sonner';
import type { NotificationPreferences } from '@/types';

export function SettingsScreen() {
  const router = useRouter();
  const { currentUser, userProfile, updateLocalProfile, isDemoMode, logout } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const defaults: NotificationPreferences = {
    matchday: true,
    athletes: true,
    support: true,
    teamOperations: true,
    leagueOperations: true,
    platformOperations: true,
  };
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    ...defaults,
    ...userProfile?.notificationPreferences,
  });
  const [lowDataMode, setLowDataMode] = useState(userProfile?.lowDataMode ?? false);

  async function signOut() {
    await logout();
    router.push('/');
  }

  async function savePreferences(next: NotificationPreferences) {
    const userId = currentUser?.uid ?? userProfile?.uid;
    if (!userId) return;
    const previous = preferences;
    setPreferences(next);
    updateLocalProfile({ notificationPreferences: next });
    try {
      await provider.updateUserProfile(userId, { notificationPreferences: next });
    } catch {
      setPreferences(previous);
      toast.error('Notification preference could not be saved.');
    }
  }

  function savePreference(key: keyof NotificationPreferences, value: boolean) {
    return savePreferences({ ...preferences, [key]: value });
  }

  async function saveLowData(value: boolean) {
    const userId = currentUser?.uid ?? userProfile?.uid;
    if (!userId) return;
    setLowDataMode(value);
    updateLocalProfile({ lowDataMode: value });
    document.documentElement.dataset.lowData = value ? 'true' : 'false';
    try {
      await provider.updateUserProfile(userId, { lowDataMode: value });
    } catch {
      setLowDataMode(!value);
      toast.error('Low-data preference could not be saved.');
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-text-strong">Settings</h1>

      <Card className="overflow-hidden">
        <Toggle icon={BellSimple} label="Matchday" description="Fixtures, kickoff, venue changes, and official results." on={preferences.matchday} onChange={(value) => savePreference('matchday', value)} />
        <Toggle icon={ShieldCheck} label="Athletes and support" description="Career updates, challenges, needs, and milestones." on={preferences.athletes && preferences.support} onChange={(value) => savePreferences({ ...preferences, athletes: value, support: value })} />
        <Toggle icon={BellSimple} label="Operational alerts" description="Confirmation requests, disputes, approvals, and notices." on={preferences.teamOperations || preferences.leagueOperations || preferences.platformOperations} onChange={(value) => savePreferences({ ...preferences, teamOperations: value, leagueOperations: value, platformOperations: value })} />
        <Toggle icon={CellSignalSlash} label="Low-data mode" description="Use text-first feeds and avoid loading non-essential media." on={lowDataMode} onChange={saveLowData} last />
      </Card>

      <Button variant="secondary" icon={SignOut} block onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}

function Toggle({ icon: Icon, label, description, on, onChange, last = false }: { icon: IconComponent; label: string; description: string; on: boolean; onChange: (value: boolean) => void; last?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 p-4', !last && 'border-b border-border')}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-3 text-muted"><Icon className="h-4 w-4" weight="bold" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-strong">{label}</p>
        <p className="text-xs text-muted">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors duration-[var(--dur-micro)]', on ? 'bg-brand' : 'bg-surface-3')}
      >
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-[var(--dur-micro)] ease-[var(--ease-fluid)]', on ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}
