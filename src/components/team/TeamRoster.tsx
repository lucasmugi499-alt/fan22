'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, UserPlus, Users as UsersIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyTeam, rosterForTeam } from '@/lib/team/teamContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { VerificationBadge } from '@/components/ui/StatusBadge';
import { normalizeVerificationStatus } from '@/lib/status';
import { Sheet } from '@/components/ui/Sheet';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { AthleteClaiming } from '@/components/athlete/AthleteClaiming';

export function TeamRoster() {
  const { userProfile, currentUser, isDemoMode, accessContext } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const catalog = useGoalPlaceData({ collections: ['teams', 'seasons'] });
  const team = useMemo(() => resolveMyTeam(userProfile, catalog.teams, [], isDemoMode, accessContext), [userProfile, catalog.teams, isDemoMode, accessContext]);
  const detail = useGoalPlaceData({
    collections: ['athletes', 'rosters'],
    scope: { teamId: team?.id ?? 'goalplace-pending' },
    recordLimit: 250,
  });
  const teams = catalog.teams;
  const seasons = catalog.seasons;
  const { athletes, rosters, retry } = detail;
  const loading = catalog.loading || (Boolean(team) && detail.loading);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [athleteName, setAthleteName] = useState('');
  const [athleteEmail, setAthleteEmail] = useState('');
  const [position, setPosition] = useState('');
  const [ageGroup, setAgeGroup] = useState<'U18' | 'U21' | 'Senior'>('Senior');
  const [inviteLink, setInviteLink] = useState('');

  const teamAthletes = useMemo(() => (team ? rosterForTeam(team.id, athletes) : []), [team, athletes]);
  const season = team ? seasons.find((item) => item.id === teams.find((item) => item.id === team.id)?.leagueId) ?? seasons.find((item) => item.leagueId === team.leagueId && item.status !== 'completed') : undefined;
  const rosterRecord = team ? rosters.find((item) => item.teamId === team.id && (!season || item.seasonId === season.id)) : undefined;
  const roster = rosterRecord
    ? teamAthletes.filter((athlete) => rosterRecord.athleteIds.includes(athlete.id))
    : teamAthletes;

  function openRosterEditor() {
    setSelectedIds(roster.map((athlete) => athlete.id));
    setEditing(true);
  }

  async function saveRoster(status: 'draft' | 'submitted' = 'draft') {
    if (!team || !season) {
      toast.error('This team needs an active season before a roster can be saved.');
      return;
    }
    const actorUserId = currentUser?.uid ?? userProfile?.uid;
    if (!actorUserId) {
      toast.error('Your Team Admin account is not ready.');
      return;
    }
    setSaving(true);
    try {
      await provider.saveRoster({
        id: rosterRecord?.id ?? `${season.id}_${team.id}`,
        leagueId: team.leagueId,
        seasonId: season.id,
        teamId: team.id,
        athleteIds: selectedIds,
        status,
        completeness: teamAthletes.length ? Math.round(selectedIds.length / teamAthletes.length * 100) : 0,
        submittedByUserId: actorUserId,
        createdAt: rosterRecord?.createdAt ?? new Date().toISOString(),
      });
      toast.success(status === 'submitted' ? 'Roster submitted to the League.' : 'Competition roster saved.');
      setEditing(false);
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'The roster could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function createAthlete() {
    if (!team || !athleteName.trim() || !position.trim() || !athleteEmail.trim()) {
      toast.error('Add the athlete name, email, and position.');
      return;
    }
    setSaving(true);
    try {
      const created = await provider.createAthleteProfile({
        teamId: team.id,
        name: athleteName.trim(),
        position: position.trim(),
        ageGroup,
        invitedEmail: athleteEmail.trim(),
      });
      if (!created.id) throw new Error('The athlete profile was created without an invite identifier.');
      const link = created.actionUrl
        ? new URL(created.actionUrl, window.location.origin).toString()
        : `${window.location.origin}/athletes/${encodeURIComponent(created.id)}`;
      setInviteLink(link);
      await navigator.clipboard.writeText(link).catch(() => undefined);
      toast.success(created.emailDelivery === 'sent'
        ? 'Athlete profile created and invite email sent.'
        : 'Athlete profile created. Invite link copied.');
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'The athlete could not be created.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-32" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-[var(--radius-lg)]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-strong">Roster</h1>
          <p className="text-sm text-muted">
            <span className="tabular tabular-nums">{roster.length}</span> registered athletes
            {rosterRecord ? ` / ${rosterRecord.status}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon={UserPlus} onClick={() => setCreating(true)}>
            Add athlete
          </Button>
          <Button size="sm" icon={UserPlus} onClick={openRosterEditor}>
            Manage
          </Button>
        </div>
      </div>

      {roster.length ? (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {roster.map((a) => {
            const vs = normalizeVerificationStatus(a.verificationStatus);
            return (
              <li key={a.id}>
                <Card className="flex items-center gap-3 p-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-bold text-muted">
                    {a.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-strong">{a.name}</p>
                    <p className="truncate text-xs text-muted">{a.position}</p>
                  </div>
                  <VerificationBadge status={vs} size="sm" />
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={UsersIcon}
          title="No athletes yet"
          description="Add your players to build the roster. Each can then request verification to earn a verified profile."
          action={<Button size="sm" icon={UserPlus} onClick={openRosterEditor}>Build roster</Button>}
        />
      )}

      {team ? <AthleteClaiming athletes={teamAthletes} scope="team" targetId={team.id} onChanged={retry} /> : null}

      <Sheet
        open={creating}
        onClose={() => { setCreating(false); setInviteLink(''); }}
        title="Invite athlete"
        description="Create the team profile and send the athlete a private account setup link."
        footer={inviteLink
          ? <Button block icon={Copy} onClick={() => { void navigator.clipboard.writeText(inviteLink); toast.success('Invite link copied.'); }}>Copy invite link</Button>
          : <Button block icon={UserPlus} onClick={createAthlete} disabled={saving}>{saving ? 'Creating...' : 'Create and invite'}</Button>}
      >
        {inviteLink ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">Send this link privately if the email was not delivered. The athlete must use the invited email address before League verification links the account.</p>
            <input className="field" readOnly value={inviteLink} />
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block text-xs font-semibold uppercase text-subtle">Full name<input className="field mt-2 normal-case" value={athleteName} onChange={(event) => setAthleteName(event.target.value)} /></label>
            <label className="block text-xs font-semibold uppercase text-subtle">Athlete email<input className="field mt-2 normal-case" type="email" value={athleteEmail} onChange={(event) => setAthleteEmail(event.target.value)} /></label>
            <label className="block text-xs font-semibold uppercase text-subtle">Position<input className="field mt-2 normal-case" value={position} onChange={(event) => setPosition(event.target.value)} /></label>
            <label className="block text-xs font-semibold uppercase text-subtle">Age group<select className="field mt-2 normal-case" value={ageGroup} onChange={(event) => setAgeGroup(event.target.value as typeof ageGroup)}><option>U18</option><option>U21</option><option>Senior</option></select></label>
          </div>
        )}
      </Sheet>

      {team ? (
        <Sheet
          open={editing}
          onClose={() => setEditing(false)}
          title="Manage competition roster"
          description={season?.name ?? 'No active season'}
          footer={
            <div className="grid grid-cols-2 gap-2">
              <Button block variant="secondary" onClick={() => void saveRoster('draft')} disabled={saving || !season}>Save draft</Button>
              <Button block icon={Check} onClick={() => void saveRoster('submitted')} disabled={saving || !season || !selectedIds.length}>Submit</Button>
            </div>
          }
        >
          <div className="space-y-2">
            {teamAthletes.map((athlete) => {
              const selected = selectedIds.includes(athlete.id);
              return (
                <label key={athlete.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => setSelectedIds((items) => selected ? items.filter((id) => id !== athlete.id) : [...items, athlete.id])}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text-strong">{athlete.name}</span>
                    <span className="block text-xs text-muted">{athlete.position}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-muted">Roster membership is editable. Athlete identity, verification, and official statistics remain governed separately.</p>
        </Sheet>
      ) : null}
    </div>
  );
}
