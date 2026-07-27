'use client';

import { useMemo, useState } from 'react';
import { Check, UserPlus, Users as UsersIcon } from '@phosphor-icons/react';
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

export function TeamRoster() {
  const { userProfile, currentUser, isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const catalog = useGoalPlaceData({ collections: ['teams', 'seasons'] });
  const team = useMemo(() => resolveMyTeam(userProfile, catalog.teams, [], isDemoMode), [userProfile, catalog.teams, isDemoMode]);
  const detail = useGoalPlaceData({
    collections: ['athletes', 'rosters'],
    scope: { teamId: team?.id ?? '__pending__' },
    recordLimit: 250,
  });
  const teams = catalog.teams;
  const seasons = catalog.seasons;
  const { athletes, rosters, retry } = detail;
  const loading = catalog.loading || (Boolean(team) && detail.loading);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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

  async function saveRoster() {
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
        status: 'draft',
        completeness: teamAthletes.length ? Math.round(selectedIds.length / teamAthletes.length * 100) : 0,
        submittedByUserId: actorUserId,
        createdAt: rosterRecord?.createdAt ?? new Date().toISOString(),
      });
      toast.success('Competition roster saved.');
      setEditing(false);
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'The roster could not be saved.');
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
          </p>
        </div>
        <Button size="sm" icon={UserPlus} onClick={openRosterEditor}>
          Manage
        </Button>
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

      {team ? (
        <Sheet
          open={editing}
          onClose={() => setEditing(false)}
          title="Manage competition roster"
          description={season?.name ?? 'No active season'}
          footer={<Button block icon={Check} onClick={saveRoster} disabled={saving || !season}>{saving ? 'Saving...' : 'Save roster'}</Button>}
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
