'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CalendarBlank, MapPin, NavigationArrow } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { isUpcomingMatch } from '@/lib/status';

function positionFor(value: string) {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return { left: 8 + (hash % 82), top: 10 + ((hash >>> 8) % 72) };
}

export function VenueMap() {
  const { matches, teams, leagues, loading } = useGoalPlaceData({
    collections: ['matches', 'teams', 'leagues'],
    recordLimit: 100,
  });
  const cities = useMemo(() => [...new Set(matches.map((match) => match.city).filter(Boolean))].sort(), [matches]);
  const [city, setCity] = useState('All');
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const leagueById = useMemo(() => new Map(leagues.map((league) => [league.id, league])), [leagues]);
  const upcoming = useMemo(
    () => matches.filter(isUpcomingMatch).filter((match) => city === 'All' || match.city === city).sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)).slice(0, 20),
    [city, matches],
  );

  if (loading) return <div className="space-y-3"><Skeleton className="h-10 w-64" /><Skeleton className="aspect-[16/8] w-full rounded-[var(--radius-lg)]" /></div>;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-strong">Local sports map</h1>
          <p className="mt-1 text-sm text-muted">Public venues and upcoming community fixtures. Athlete home locations are never shown.</p>
        </div>
        <label className="text-xs font-semibold uppercase text-subtle">City or district<select className="field mt-2 min-w-44 normal-case" value={city} onChange={(event) => setCity(event.target.value)}><option>All</option>{cities.map((item) => <option key={item}>{item}</option>)}</select></label>
      </header>

      <div className="relative h-64 w-full overflow-hidden rounded-[var(--radius-lg)] border border-border bg-[#101d19] sm:h-auto sm:min-h-64 sm:aspect-[16/9]">
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(67,220,146,.13)_1px,transparent_1px),linear-gradient(90deg,rgba(67,220,146,.13)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="absolute inset-x-[9%] top-[20%] h-px rotate-[9deg] bg-brand/25" />
        <div className="absolute inset-y-[8%] left-[38%] w-px -rotate-[14deg] bg-brand/20" />
        {upcoming.map((match, index) => {
          const position = positionFor(`${match.venue}-${match.city}`);
          return (
            <Link key={match.id} href={`/matches/${match.id}`} aria-label={`Match at ${match.venue}`} className="group absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${position.left}%`, top: `${position.top}%` }}>
              <span className="relative grid h-8 w-8 place-items-center rounded-full border-2 border-[#101d19] bg-brand text-on-brand shadow-[0_3px_14px_rgba(0,0,0,.45)] transition-transform group-hover:scale-110">
                <MapPin className="h-4 w-4" weight="fill" />
                {index < 5 ? <span className="absolute inset-0 animate-ping rounded-full bg-brand/30 motion-reduce:hidden" /> : null}
              </span>
            </Link>
          );
        })}
        <p className="absolute bottom-3 left-3 rounded-[var(--radius-sm)] bg-black/50 px-2 py-1 text-[10px] font-semibold uppercase text-white/70">Schematic venue view</p>
      </div>

      {upcoming.length ? (
        <div className="grid gap-2 md:grid-cols-2">
          {upcoming.map((match) => {
            const home = teamById.get(match.homeTeamId);
            const away = teamById.get(match.awayTeamId);
            return (
              <Card key={match.id} className="flex min-w-0 items-center gap-3 p-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand"><CalendarBlank className="h-5 w-5" weight="duotone" /></span>
                <Link href={`/matches/${match.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-strong">{home?.name} vs {away?.name}</p>
                  <p className="truncate text-xs text-muted">{new Date(match.scheduledAt).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short' })} · {match.venue}</p>
                  <p className="truncate text-[11px] text-subtle">{leagueById.get(match.leagueId)?.name}</p>
                </Link>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${match.venue}, ${match.city}, Uganda`)}`} target="_blank" rel="noreferrer" aria-label={`Directions to ${match.venue}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border text-muted hover:text-brand"><NavigationArrow className="h-4 w-4" weight="fill" /></a>
              </Card>
            );
          })}
        </div>
      ) : <EmptyState icon={MapPin} title="No fixtures nearby yet" description="Try another city or return when the league publishes its next round." />}
    </div>
  );
}
