'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellSimple, Envelope, ShieldCheck, Moon, SignOut } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { IconComponent } from '@/lib/icons';

export function SettingsScreen() {
  const router = useRouter();
  const { logout } = useAuth();

  async function signOut() {
    await logout();
    router.push('/');
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-text-strong">Settings</h1>

      <Card className="overflow-hidden">
        <Toggle icon={BellSimple} label="Push notifications" description="Match confirmations, support and results." defaultOn />
        <Toggle icon={Envelope} label="Email updates" description="Weekly summary of your teams and athletes." />
        <Toggle icon={ShieldCheck} label="Verification alerts" description="Tell me the moment a result turns official." defaultOn />
        <Toggle icon={Moon} label="Dark theme" description="GoalPlace256 is tuned for dark. Light is coming later." defaultOn last />
      </Card>

      <Button variant="secondary" icon={SignOut} block onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}

function Toggle({ icon: Icon, label, description, defaultOn = false, last = false }: { icon: IconComponent; label: string; description: string; defaultOn?: boolean; last?: boolean }) {
  const [on, setOn] = useState(defaultOn);
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
        onClick={() => setOn((v) => !v)}
        className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors duration-[var(--dur-micro)]', on ? 'bg-brand' : 'bg-surface-3')}
      >
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-[var(--dur-micro)] ease-[var(--ease-fluid)]', on ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}
