import type { Metadata } from 'next';
import { Pick5Board, type Pick5PlayerCard } from '@/components/fantasy/Pick5Board';
import { fantasyGameMode } from '@/lib/fantasy/pick5';
import {
  getFantasyCompetitionBundle,
  getFantasyPlayerCards,
} from '@/server/fantasy/catalogue';

export const metadata: Metadata = {
  title: 'Pick 5 | GoalPlace256',
  description: 'Five athletes, one captain, one scout pick. Free, and it resets every round.',
};

export const dynamic = 'force-dynamic';

export default async function Pick5Page({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const { competitionId } = await params;
  const [bundle, players] = await Promise.all([
    getFantasyCompetitionBundle(competitionId),
    getFantasyPlayerCards(competitionId),
  ]);
  if (!bundle) {
    return <main className="p-8 text-center text-muted">Competition not found.</main>;
  }
  if (fantasyGameMode(bundle.competition) !== 'pick5') {
    return (
      <main className="mx-auto max-w-xl p-8 text-center">
        <h1 className="text-2xl font-semibold text-text-strong">This competition runs the season squad</h1>
        <p className="mt-2 text-sm text-muted">
          Pick 5 is a separate game. Build a full squad from the team page instead.
        </p>
      </main>
    );
  }
  const round = bundle.rounds.find((item) => item.status === 'open') ?? bundle.rounds[0];
  if (!round) {
    return <main className="p-8 text-center text-muted">No round is open yet.</main>;
  }
  return (
    <Pick5Board
      competition={bundle.competition}
      players={players as Pick5PlayerCard[]}
      roundId={round.id}
      roundNumber={round.number}
      deadlineAt={round.deadlineAt}
      leagueName={bundle.competition.name}
    />
  );
}
