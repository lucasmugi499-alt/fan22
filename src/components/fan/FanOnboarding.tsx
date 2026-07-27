'use client';

import { useMemo, useState } from 'react';
import { Basketball, Check, FlagCheckered, SoccerBall } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { dataProvider } from '@/data/dataProvider';
import { useAuth } from '@/context/AuthProvider';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { Athlete, League, SportSlug, Team } from '@/types';

const SPORT_OPTIONS: Array<{
  id: SportSlug;
  label: string;
  icon: typeof SoccerBall;
}> = [
  { id: 'football', label: 'Football', icon: SoccerBall },
  { id: 'basketball', label: 'Basketball', icon: Basketball },
  { id: 'rugby', label: 'Rugby', icon: FlagCheckered },
];

function toggle(items: string[], id: string) {
  return items.includes(id) ? items.filter((item) => item !== id) : [...items, id];
}

export function FanOnboarding({
  open,
  onClose,
  leagues,
  teams,
  athletes,
}: {
  open: boolean;
  onClose: () => void;
  leagues: League[];
  teams: Team[];
  athletes: Athlete[];
}) {
  const { userProfile, isDemoMode, updateLocalProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [sports, setSports] = useState<SportSlug[]>(userProfile?.sportPreferences ?? []);
  const [city, setCity] = useState(userProfile?.city ?? 'Kampala');
  const [leagueIds, setLeagueIds] = useState<string[]>(userProfile?.followedLeagues ?? []);
  const [teamIds, setTeamIds] = useState<string[]>(userProfile?.followedTeams ?? []);
  const [athleteIds, setAthleteIds] = useState<string[]>(userProfile?.followedAthletes ?? []);
  const [saving, setSaving] = useState(false);

  const visibleLeagues = useMemo(
    () => leagues.filter((league) =>
      (!sports.length || sports.includes(String(league.sport).toLowerCase() as SportSlug)) &&
      (!city || league.city === city)),
    [city, leagues, sports],
  );
  const visibleTeams = useMemo(
    () => teams.filter((team) =>
      (!leagueIds.length || leagueIds.includes(team.leagueId)) &&
      (!city || team.city === city)),
    [city, leagueIds, teams],
  );
  const visibleAthletes = useMemo(
    () => athletes.filter((athlete) =>
      (!teamIds.length || teamIds.includes(athlete.teamId)) &&
      (!city || athlete.city === city)).slice(0, 18),
    [athletes, city, teamIds],
  );
  const cities = [...new Set(leagues.map((league) => league.city))].sort();

  async function complete() {
    if (!userProfile || saving) return;
    setSaving(true);
    const completedAt = new Date().toISOString();
    const updates = {
      city,
      sportPreferences: sports,
      followedLeagues: leagueIds,
      followedTeams: teamIds,
      followedAthletes: athleteIds,
      onboardingCompletedAt: completedAt,
    };
    updateLocalProfile(updates);

    try {
      if (!isDemoMode) {
        await dataProvider.updateUserProfile(userProfile.id, {
          city,
          sportPreferences: sports,
          onboardingCompletedAt: completedAt,
        });
        const followActions = [
          ...leagueIds
            .filter((id) => !userProfile.followedLeagues.includes(id))
            .map((id) => dataProvider.toggleFollow(userProfile.id, 'league', id)),
          ...teamIds
            .filter((id) => !userProfile.followedTeams.includes(id))
            .map((id) => dataProvider.toggleFollow(userProfile.id, 'team', id)),
          ...athleteIds
            .filter((id) => !userProfile.followedAthletes.includes(id))
            .map((id) => dataProvider.toggleFollow(userProfile.id, 'athlete', id)),
        ];
        await Promise.all(followActions);
      }
      toast.success('Your sports home is ready.');
      onClose();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save your sports home.');
    } finally {
      setSaving(false);
    }
  }

  const steps = [
    <div key="sports" className="space-y-4">
      <p className="text-sm text-muted">Choose the sports you want to see first.</p>
      <div className="grid grid-cols-3 gap-2">
        {SPORT_OPTIONS.map(({ id, label, icon: Icon }) => {
          const active = sports.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSports((items) => toggle(items, id) as SportSlug[])}
              className={cn(
                'flex min-h-24 flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border p-3 text-sm font-semibold',
                active ? 'border-brand bg-brand-subtle text-brand' : 'border-border bg-surface-2 text-muted',
              )}
            >
              <Icon className="h-6 w-6" weight={active ? 'fill' : 'duotone'} />
              {label}
            </button>
          );
        })}
      </div>
      <label className="block text-xs font-semibold uppercase text-subtle">
        City or district
        <select
          value={city}
          onChange={(event) => setCity(event.target.value)}
          className="mt-2 h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm normal-case text-text-strong"
        >
          {cities.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
    </div>,
    <ChoiceGrid
      key="leagues"
      description="Follow leagues to receive fixtures, table movement, and notices."
      items={visibleLeagues.map((item) => ({ id: item.id, title: item.name, meta: `${item.city} / ${item.sport}` }))}
      selected={leagueIds}
      onToggle={(id) => setLeagueIds((items) => toggle(items, id))}
    />,
    <ChoiceGrid
      key="teams"
      description="Choose the teams you care about."
      items={visibleTeams.map((item) => ({ id: item.id, title: item.name, meta: item.city }))}
      selected={teamIds}
      onToggle={(id) => setTeamIds((items) => toggle(items, id))}
    />,
    <ChoiceGrid
      key="athletes"
      description="Add athletes to your personal career and support feed."
      items={visibleAthletes.map((item) => ({ id: item.id, title: item.name, meta: item.position }))}
      selected={athleteIds}
      onToggle={(id) => setAthleteIds((items) => toggle(items, id))}
    />,
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Build your sports home"
      description={`Step ${step + 1} of ${steps.length}`}
      footer={
        <div className="flex gap-2">
          {step > 0 ? <Button variant="secondary" onClick={() => setStep((value) => value - 1)}>Back</Button> : null}
          {step < steps.length - 1 ? (
            <Button block onClick={() => setStep((value) => value + 1)}>Continue</Button>
          ) : (
            <Button block icon={Check} onClick={complete} disabled={saving}>
              {saving ? 'Saving...' : 'Finish'}
            </Button>
          )}
        </div>
      }
    >
      {steps[step]}
    </Sheet>
  );
}

function ChoiceGrid({
  description,
  items,
  selected,
  onToggle,
}: {
  description: string;
  items: Array<{ id: string; title: string; meta: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{description}</p>
      <div className="grid max-h-[52dvh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {items.map((item) => {
          const active = selected.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              className={cn(
                'flex min-h-16 items-center justify-between gap-3 rounded-[var(--radius-md)] border p-3 text-left',
                active ? 'border-brand bg-brand-subtle' : 'border-border bg-surface-2',
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-text-strong">{item.title}</span>
                <span className="block truncate text-xs text-muted">{item.meta}</span>
              </span>
              <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full border', active ? 'border-brand bg-brand text-on-brand' : 'border-border')}>
                {active ? <Check className="h-3.5 w-3.5" weight="bold" /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
