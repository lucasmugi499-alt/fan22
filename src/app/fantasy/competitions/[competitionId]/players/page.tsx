import Image from 'next/image';
import type { Metadata } from 'next';
import { FantasyPlayersDirectory } from '@/components/fantasy/FantasyExperience';
import {
  getFantasyCompetitionBundle,
  getFantasyPlayerCards,
} from '@/server/fantasy/catalogue';

export const metadata: Metadata = {
  title: 'Fantasy Players | GoalPlace256',
  description: 'Browse eligible athletes, verified recent form, availability and Fantasy Credit prices.',
};

export const dynamic = 'force-dynamic';

export default async function FantasyPlayersPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const { competitionId } = await params;
  const [bundle, players] = await Promise.all([
    getFantasyCompetitionBundle(competitionId),
    getFantasyPlayerCards(competitionId),
  ]);
  return (
    <FantasyPlayersDirectory competition={bundle?.competition ?? null}>
      <div className="divide-y divide-border border-y border-border">
        {players.slice(0, 50).map((player) => (
          <div key={player.athleteId} className="grid min-h-[72px] grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 py-2">
            <div className="relative h-11 w-11 overflow-hidden rounded-full bg-surface-2">
              <Image src={player.avatarUrl} alt="" fill sizes="44px" className="object-cover" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-text-strong">{player.name}</p>
              <p className="truncate text-xs text-muted">{player.teamName} · {player.position}</p>
              <p className="mt-1 text-xs text-subtle">{player.ownershipPercentage}% selected · form {player.verifiedRecentForm.join(' · ')}</p>
            </div>
            <p className="text-right font-bold text-text-strong">{player.credits}<span className="block text-[10px] font-normal text-muted">credits</span></p>
          </div>
        ))}
      </div>
      {players.length > 50 ? <p className="mt-4 text-sm text-muted">Showing 50 of {players.length}. Use the squad builder to search the complete eligible list.</p> : null}
    </FantasyPlayersDirectory>
  );
}
