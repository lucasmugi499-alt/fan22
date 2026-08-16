'use client';

import Link from 'next/link';

import { useMemo, useState } from 'react';
import { Check, SealCheck, PencilSimple, MapPin, Trophy, Coins, Users } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyTeam, teamRecord } from '@/lib/team/teamContext';
import { useTeamOfficialStanding } from '@/lib/team/useTeamStanding';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { NoAssignment } from '@/components/ui/NoAssignment';
import { VerificationBadge } from '@/components/ui/StatusBadge';
import { normalizeVerificationStatus } from '@/lib/status';
import { Sheet } from '@/components/ui/Sheet';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { ChallengeWorkflow } from '@/components/core/ChallengeWorkflow';
import { SupportNeedWorkflow } from '@/components/core/SupportNeedWorkflow';

function ugx(n: number): string {
  if (n >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `UGX ${(n / 1_000).toFixed(0)}k`;
  return `UGX ${n}`;
}

export function TeamProfile() {
  const { userProfile, isDemoMode, accessContext } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const catalog = useGoalPlaceData({ collections: ['teams'] });
  const team = useMemo(() => resolveMyTeam(userProfile, catalog.teams, [], isDemoMode, accessContext), [userProfile, catalog.teams, isDemoMode, accessContext]);
  const detail = useGoalPlaceData({
    collections: ['athletes'],
    scope: { teamId: team?.id ?? 'goalplace-pending' },
    recordLimit: 250,
  });
  const { athletes, retry } = detail;
  const { standing } = useTeamOfficialStanding(team ?? undefined);
  const loading = catalog.loading || (Boolean(team) && detail.loading);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  const rosterCount = useMemo(
    () => (team ? athletes.filter((a) => a.teamId === team.id).length : 0),
    [team, athletes]
  );

  function openEditor() {
    if (!team) return;
    setName(team.name);
    setCity(team.city);
    setLocation(team.location ?? '');
    setDescription(team.description);
    setAdminName(team.teamAdminName ?? '');
    setAdminEmail(team.teamAdminEmail ?? '');
    setEditing(true);
  }

  async function saveProfile() {
    if (!team || !name.trim() || !city.trim()) {
      toast.error('Add a team name and city.');
      return;
    }
    setSaving(true);
    try {
      await provider.updateTeamProfile(team.id, {
        name: name.trim(),
        city: city.trim(),
        location: location.trim(),
        description: description.trim(),
        teamAdminName: adminName.trim(),
        teamAdminEmail: adminEmail.trim(),
        logoUrl: team.logoUrl,
      });
      toast.success('Team profile updated.');
      setEditing(false);
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'The team profile could not be updated.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-[var(--radius-lg)]" />
        <Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" />
      </div>
    );
  }
  if (!team) return <NoAssignment kind="team" />;

  const vs = normalizeVerificationStatus(team.verificationStatus ?? (team.verified ? 'verified' : 'pending'));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-strong">Team profile</h1>
        <Button size="sm" variant="secondary" icon={PencilSimple} onClick={openEditor}>
          Edit
        </Button>
      </div>

      {/* Identity */}
      <Card className="p-4">
        <div className="flex items-center gap-3.5">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[var(--radius-lg)] border border-[color:var(--border-glow)] bg-surface-2 text-xl font-bold text-text-strong shadow-[var(--glow-brand)]">
            {team.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-text-strong">{team.name}</h2>
              {team.verified ? <SealCheck className="h-5 w-5 shrink-0 text-[var(--state-verified)]" weight="fill" /> : null}
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
              <MapPin className="h-3.5 w-3.5" /> {team.city}, {team.country}
            </p>
            <div className="mt-2"><VerificationBadge status={vs} size="sm" /></div>
          </div>
        </div>
        {team.description ? <p className="mt-3 text-sm leading-relaxed text-muted">{team.description}</p> : null}
      </Card>

      {/* Season snapshot */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Both read the official standings projection. team.record and
            team.leaguePoints are stored aggregates that derive from no match. */}
        <Stat
          icon={Trophy}
          label="Record"
          value={standing ? `${standing.wins}-${standing.draws}-${standing.losses}` : teamRecord(team)}
          accent="text-text-strong"
        />
        <Stat
          icon={Trophy}
          label="League points"
          value={String(standing?.points ?? team.leaguePoints)}
          accent="text-brand"
        />
        <Stat icon={Users} label="Supporters" value={String(team.supportersCount)} accent="text-text-strong" />
        <Stat icon={Coins} label="Total support" value={ugx(team.totalSupport)} accent="text-[var(--brand-2)]" />
      </div>

      <Card className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold text-text-strong">Roster</p>
          <p className="text-xs text-muted"><span className="tabular tabular-nums">{rosterCount}</span> registered athletes</p>
        </div>
        <Link href="/team-admin/roster" className="text-sm font-medium text-brand hover:underline">Manage</Link>
      </Card>

      <ChallengeWorkflow scope="team" targetId={team.id} />
      <SupportNeedWorkflow scope="team" targetId={team.id} />

      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit team profile"
        description="Public identity and contact details"
        footer={<Button block icon={Check} onClick={saveProfile} disabled={saving}>{saving ? 'Saving...' : 'Save profile'}</Button>}
      >
        <div className="space-y-4">
          <Field label="Team name"><input className="field" value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="City"><input className="field" value={city} onChange={(event) => setCity(event.target.value)} /></Field>
          <Field label="Home venue"><input className="field" value={location} onChange={(event) => setLocation(event.target.value)} /></Field>
          <Field label="Team story"><textarea className="field min-h-28 py-3" value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
          <Field label="Team Admin name"><input className="field" value={adminName} onChange={(event) => setAdminName(event.target.value)} /></Field>
          <Field label="Team Admin email"><input className="field" type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} /></Field>
          <p className="text-xs text-muted">League membership, competition record, verification, and support totals cannot be changed from this form.</p>
        </div>
      </Sheet>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold uppercase text-subtle">{label}<span className="mt-2 block normal-case">{children}</span></label>;
}

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <Card className="p-3.5">
      <span className="mb-2 inline-grid h-8 w-8 place-items-center rounded-full bg-surface-3 text-muted">
        <Icon className="h-4 w-4" weight="bold" />
      </span>
      <p data-numeric className={`tabular text-lg font-bold tabular-nums ${accent}`}>{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</p>
    </Card>
  );
}
