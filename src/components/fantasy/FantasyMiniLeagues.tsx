import Link from 'next/link';
import { LockSimple, Trophy, UsersThree } from '@phosphor-icons/react/dist/ssr';
import { MiniLeagueJoin } from './MiniLeagueJoin';
import { MiniLeagueCreate } from './MiniLeagueCreate';
import type {
  FantasyLeaderboardEntry,
  FantasyMiniLeague,
  FantasyMiniLeagueMember,
} from '@/types/fantasy';

export function FantasyMiniLeagues({
  miniLeagues,
  members,
  competitions,
}: {
  miniLeagues: FantasyMiniLeague[];
  members: FantasyMiniLeagueMember[];
  competitions: import('@/types/fantasy').FantasyCompetition[];
}) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 pb-24 sm:px-6">
      <p className="text-sm font-semibold text-brand">GoalPlace Fantasy</p>
      <h1 className="mt-2 font-display text-3xl font-bold text-text-strong">Mini-leagues</h1>
      <p className="mt-2 max-w-2xl text-muted">Free private tables for friends, clubs, and communities. No paid entry or cash pool.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {miniLeagues.map((league) => {
          const leagueMembers = members.filter((item) => item.miniLeagueId === league.id);
          return (
            <Link key={league.id} href={`/fantasy/mini-leagues/${league.id}`} className="border border-border bg-surface-1 p-5 hover:border-brand">
              <div className="flex items-center justify-between">
                <Trophy className="h-6 w-6 text-brand" weight="fill" />
                {league.visibility === 'private' ? <LockSimple className="h-4 w-4 text-muted" /> : null}
              </div>
              <h2 className="mt-6 text-xl font-bold text-text-strong">{league.name}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{league.description}</p>
              <p className="mt-4 flex items-center gap-2 text-xs text-subtle"><UsersThree className="h-4 w-4" /> {leagueMembers.length}/{league.memberLimit} managers</p>
            </Link>
          );
        })}
      </div>
      <MiniLeagueCreate competitions={competitions} />
    </main>
  );
}

export function FantasyMiniLeagueDetail({
  league,
  members,
  leaderboards,
}: {
  league: FantasyMiniLeague | null;
  members: FantasyMiniLeagueMember[];
  leaderboards: FantasyLeaderboardEntry[];
}) {
  if (!league) return <main className="p-8 text-center text-muted">Mini-league not found.</main>;
  const memberTeamIds = new Set(
    members.filter((item) => item.miniLeagueId === league.id).map((item) => item.fantasyTeamId),
  );
  const standings = leaderboards.filter((item) => memberTeamIds.has(item.fantasyTeamId));
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 pb-24 sm:px-6">
      <Link href="/fantasy/mini-leagues" className="text-sm font-semibold text-brand">← Mini-leagues</Link>
      <div className="mt-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-text-strong">{league.name}</h1>
          <p className="mt-2 text-muted">{league.description}</p>
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-xs capitalize text-muted">{league.visibility}</span>
      </div>
      <div className="mt-8 divide-y divide-border border-y border-border">
        {standings.map((entry, index) => (
          <div key={entry.id} className="grid min-h-14 grid-cols-[40px_1fr_auto] items-center gap-3">
            <span className="font-bold text-brand">{index + 1}</span>
            <span className="truncate font-semibold text-text-strong">{entry.teamName}</span>
            <span className="font-bold text-text-strong">{entry.totalPoints}</span>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs text-muted">Invite code: <span className="font-mono font-semibold text-text-strong">{league.inviteCode}</span> · New members require approval.</p>
      <MiniLeagueJoin inviteCode={league.inviteCode} />
    </main>
  );
}
