'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { PlusCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { buildPlatformOrganizationTree } from '@/lib/platform/platformOperations';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  DirectoryRow,
  EmptyState,
  PlatformAdminHeader,
  PlatformSearch,
  PlatformStatGrid,
  StatusChip,
} from '@/components/platform/PlatformAdminPrimitives';
import type { SportSlug } from '@/types';

const inputClass = 'h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text-strong outline-none placeholder:text-subtle focus:border-brand';

export function OrganizationDirectory() {
  const { isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const { leagues, teams, seasons, athletes, matches, teamAssignments, loading, retry } = useGoalPlaceData({
    collections: ['leagues', 'teams', 'seasons', 'athletes', 'matches', 'teamAssignments'],
    recordLimit: 700,
  });
  const [query, setQuery] = useState('');
  const [sport, setSport] = useState<'all' | SportSlug>('all');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [newSport, setNewSport] = useState<SportSlug>('football');

  const tree = useMemo(() => buildPlatformOrganizationTree({
    leagues,
    seasons,
    teams,
    athletes,
    matches,
    teamAssignments,
  }), [athletes, leagues, matches, seasons, teamAssignments, teams]);

  const filtered = tree.filter((node) => {
    const haystack = `${node.league.name} ${node.league.city} ${node.league.sport}`.toLowerCase();
    const matchesSearch = !query.trim() || haystack.includes(query.trim().toLowerCase());
    const matchesSport = sport === 'all' || String(node.league.sport).toLowerCase() === sport;
    return matchesSearch && matchesSport;
  });

  async function createLeague(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    try {
      const year = new Date().getFullYear();
      await provider.createLeague({
        name: name.trim(),
        sport: newSport,
        city: city.trim(),
        country: 'Uganda',
        description: `${name.trim()} created from Platform Admin organization control.`,
        status: 'community',
        plan: 'free',
        verified: false,
        adminUserIds: [],
        season: `${year} Season`,
        teamsCount: 0,
        athletesCount: 0,
        matchesCount: 0,
        matchCompletionRate: 0,
        verifiedResultsRate: 0,
        goalPlaceIndex: 45,
        totalSupport: 0,
        supportersCount: 0,
        verificationRules: {
          requiresLeagueAdminApproval: true,
          requiresRefereeConfirmation: false,
          allowsPerformancePledges: true,
        },
      });
      toast.success('League created through the trusted Platform Admin command.');
      setName('');
      setCity('');
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'League could not be created.');
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <Skeleton className="h-[560px] rounded-[var(--radius-lg)]" />;
  }

  return (
    <section className="space-y-5">
      <PlatformAdminHeader
        eyebrow="Network"
        title="Organizations"
        description="Search leagues and teams, inspect the operating tree, and create new league records through trusted platform commands."
      />

      <PlatformStatGrid items={[
        { label: 'Leagues', value: leagues.length },
        { label: 'Teams', value: teams.length },
        { label: 'Athletes', value: athletes.length },
        { label: 'Suspended orgs', value: leagues.filter((item) => item.status === 'suspended').length + teams.filter((item) => item.verificationStatus === 'rejected').length, tone: 'warn' },
      ]} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-4">
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
            <PlatformSearch value={query} onChange={setQuery} placeholder="Search leagues, regions or sports" />
            <select value={sport} onChange={(event) => setSport(event.target.value as 'all' | SportSlug)} className={inputClass} aria-label="Sport filter">
              <option value="all">All sports</option>
              <option value="football">Football</option>
              <option value="basketball">Basketball</option>
              <option value="rugby">Rugby</option>
            </select>
          </div>

          <div className="space-y-2.5">
            {filtered.length ? filtered.map((node) => (
              <DirectoryRow
                key={node.league.id}
                href={`/admin/leagues/${encodeURIComponent(node.league.id)}`}
                title={node.league.name}
                meta={`${node.league.city} · ${node.league.sport} · ${node.teams.length} teams · ${node.athletesCount} athletes`}
                status={node.league.lifecycleStatus ?? node.league.status}
                statusTone={node.league.status === 'suspended' ? 'bad' : node.league.verified ? 'good' : 'neutral'}
                detail={
                  <div className="flex flex-wrap gap-1.5">
                    <StatusChip label={`${node.officialResults} official results`} />
                    <StatusChip label={`${node.disputedResults} disputes`} tone={node.disputedResults ? 'warn' : 'neutral'} />
                    <StatusChip label={`${node.pendingInvites} pending invites`} tone={node.pendingInvites ? 'warn' : 'neutral'} />
                  </div>
                }
              />
            )) : (
              <EmptyState title="No organizations match this filter">Adjust the search or create a league from the command panel.</EmptyState>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">Command</p>
            <h2 className="mt-1 text-[15px] font-semibold text-text-strong">Create organization</h2>
            <p className="mt-1 text-xs leading-5 text-muted">This creates the league record and opening season through the trusted admin API.</p>
          </div>
          <form onSubmit={createLeague} className="space-y-3">
            <input required minLength={3} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="League name" aria-label="League name" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <select value={newSport} onChange={(event) => setNewSport(event.target.value as SportSlug)} className={inputClass} aria-label="Sport">
                <option value="football">Football</option>
                <option value="basketball">Basketball</option>
                <option value="rugby">Rugby</option>
              </select>
              <input required minLength={2} value={city} onChange={(event) => setCity(event.target.value)} className={inputClass} placeholder="Region or city" aria-label="Region or city" />
            </div>
            <Button type="submit" icon={PlusCircle} disabled={creating || !name.trim() || !city.trim()} block>
              {creating ? 'Creating...' : 'Create league'}
            </Button>
          </form>
        </Card>
      </div>
    </section>
  );
}
