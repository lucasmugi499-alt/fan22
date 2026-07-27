'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, EnvelopeSimple, Medal, PencilSimple, SignOut, Star, Trophy, UsersThree } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DemoDataNote } from '@/components/ui/DemoDataNote';
import { Sheet } from '@/components/ui/Sheet';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { resendEmailVerification } from '@/lib/firebase/auth';
import { toast } from 'sonner';

const ROLE_LABEL: Record<string, string> = {
  fan: 'Fan', athlete: 'Athlete', team_admin: 'Team Admin', league_admin: 'League Admin', platform_admin: 'Platform Admin', super_admin: 'Super Admin', sponsor: 'Sponsor',
};

export function ProfileScreen() {
  const router = useRouter();
  const { currentUser, userProfile, role, isDemoMode, updateLocalProfile, logout } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState(userProfile?.displayName ?? userProfile?.name ?? '');
  const [city, setCity] = useState(userProfile?.city ?? '');
  const [avatarUrl, setAvatarUrl] = useState(userProfile?.avatarUrl ?? '');
  const name = userProfile?.name ?? 'Guest';
  const userId = userProfile?.id ?? userProfile?.uid ?? '';
  const followCount = (userProfile?.followedAthletes?.length ?? 0) +
    (userProfile?.followedTeams?.length ?? 0) +
    (userProfile?.followedLeagues?.length ?? 0);

  function openEditor() {
    setDisplayName(userProfile?.displayName ?? userProfile?.name ?? '');
    setCity(userProfile?.city ?? '');
    setAvatarUrl(userProfile?.avatarUrl ?? '');
    setEditing(true);
  }

  // Signing out is a navigation event, not just a state change: land back on the public
  // site so it is unmistakable that the session ended.
  async function signOut() {
    await logout();
    router.push('/');
  }

  async function saveProfile() {
    if (!userId || !displayName.trim()) return;
    setSaving(true);
    try {
      const updates = { name: displayName.trim(), displayName: displayName.trim(), city: city.trim(), avatarUrl: avatarUrl.trim() };
      await provider.updateUserProfile(userId, updates);
      if (updates.city && updates.avatarUrl) {
        await provider.recordPointsAction({
          userId,
          actionType: 'profile_completed',
        }).catch(() => undefined);
      }
      updateLocalProfile(updates);
      setEditing(false);
      toast.success('Profile updated.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Your profile could not be updated.');
    } finally {
      setSaving(false);
    }
  }

  async function resendVerification() {
    if (!currentUser) return;
    try {
      await resendEmailVerification(currentUser);
      toast.success('Verification email sent.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Verification email could not be sent.');
    }
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
        <Button className="mt-4" size="sm" variant="secondary" icon={PencilSimple} onClick={openEditor}>Edit profile</Button>
      </Card>

      {!isDemoMode && currentUser && !currentUser.emailVerified ? (
        <Card className="flex items-center gap-3 p-4">
          <EnvelopeSimple className="h-5 w-5 shrink-0 text-[var(--state-pending)]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text-strong">Verify your email</p>
            <p className="text-xs text-muted">Verification protects account recovery and privileged invitations.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={resendVerification}>Resend</Button>
        </Card>
      ) : null}

      {userProfile ? (
        <div className="grid grid-cols-3 gap-2.5">
          <Stat icon={Star} label="GP Points" value={userProfile.points} accent="text-brand" />
          <Stat icon={UsersThree} label="Following" value={followCount} />
          <Stat icon={Trophy} label="Leagues" value={userProfile.followedLeagues?.length ?? 0} />
        </div>
      ) : null}

      {userProfile ? (
        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-text-strong"><Medal className="h-4 w-4 text-brand" weight="duotone" /> Community badges</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge label="Founding Supporter" />
            {userProfile.onboardingCompletedAt ? <Badge label="Local League Champion" /> : null}
            {followCount >= 3 ? <Badge label="Community Follower" /> : null}
            {(userProfile.followedAthletes?.length ?? 0) > 0 ? <Badge label="Athlete Advocate" /> : null}
          </div>
          <p className="mt-3 text-xs text-muted">Badges recognize participation and consistency. Contribution size never buys status.</p>
        </Card>
      ) : null}

      {isDemoMode ? <DemoDataNote /> : null}

      <Button variant="secondary" icon={SignOut} block onClick={signOut}>
        Sign out
      </Button>

      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit profile"
        description="Your public fan identity and local sports area"
        footer={<Button block icon={Check} onClick={saveProfile} disabled={saving}>{saving ? 'Saving...' : 'Save profile'}</Button>}
      >
        <div className="space-y-4">
          <label className="block text-xs font-semibold uppercase text-subtle">Display name<input className="field mt-2 normal-case" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
          <label className="block text-xs font-semibold uppercase text-subtle">City or district<input className="field mt-2 normal-case" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Kampala" /></label>
          <label className="block text-xs font-semibold uppercase text-subtle">Profile photo URL<input className="field mt-2 normal-case" type="url" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..." /></label>
        </div>
      </Sheet>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return <span className="rounded-[var(--radius-pill)] border border-brand/30 bg-brand-subtle px-2.5 py-1 text-xs font-semibold text-brand">{label}</span>;
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
