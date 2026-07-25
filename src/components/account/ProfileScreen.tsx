'use client';

import { useRouter } from 'next/navigation';
import { SignOut, Star, Wallet, UsersThree } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useAppStore } from '@/lib/store';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DemoDataNote } from '@/components/ui/DemoDataNote';

const ROLE_LABEL: Record<string, string> = {
  fan: 'Fan', athlete: 'Athlete', team_admin: 'Team Admin', league_admin: 'League Admin', platform_admin: 'Platform Admin', super_admin: 'Super Admin', sponsor: 'Sponsor',
};

export function ProfileScreen() {
  const router = useRouter();
  const { userProfile, role, isDemoMode, logout } = useAuth();
  const demoWalletSpent = useAppStore((s) => s.demoWalletSpent);
  const name = userProfile?.name ?? 'Guest';
  const userId = userProfile?.id ?? userProfile?.uid ?? '';
  const balance = (userProfile?.walletBalance ?? 0) - (demoWalletSpent[userId] ?? 0);

  // Signing out is a navigation event, not just a state change: land back on the public
  // site so it is unmistakable that the session ended.
  async function signOut() {
    await logout();
    router.push('/');
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-text-strong">Profile</h1>

      <Card className="p-4">
        <div className="flex items-center gap-3.5">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand text-on-brand text-lg font-bold shadow-[var(--glow-brand)]">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-text-strong">{name}</h2>
            <p className="truncate text-sm text-muted">{userProfile?.email ?? 'Not signed in'}</p>
            {role ? <span className="mt-1.5 inline-block rounded-[var(--radius-pill)] border border-border bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-muted">{ROLE_LABEL[role] ?? role}</span> : null}
          </div>
        </div>
      </Card>

      {userProfile ? (
        <div className="grid grid-cols-3 gap-2.5">
          <Stat icon={Star} label="GP Points" value={userProfile.points} accent="text-brand" />
          <Stat icon={Wallet} label="Balance" value={balance} />
          <Stat icon={UsersThree} label="Following" value={(userProfile.followedAthletes?.length ?? 0) + (userProfile.followedTeams?.length ?? 0)} />
        </div>
      ) : null}

      {isDemoMode ? <DemoDataNote /> : null}

      <Button variant="secondary" icon={SignOut} block onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent = 'text-text-strong' }: { icon: typeof Star; label: string; value: number; accent?: string }) {
  return (
    <Card className="p-3.5">
      <span className="mb-2 inline-grid h-8 w-8 place-items-center rounded-full bg-surface-3 text-muted"><Icon className="h-4 w-4" weight="bold" /></span>
      <p data-numeric className={`tabular text-lg font-bold tabular-nums ${accent}`}>{value.toLocaleString()}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</p>
    </Card>
  );
}
