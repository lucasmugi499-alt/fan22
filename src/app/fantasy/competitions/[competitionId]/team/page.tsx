import type { Metadata } from 'next';
import { FantasySquadBuilder } from '@/components/fantasy/FantasySquadBuilder';
import {
  getFantasyCompetitionBundle,
  getFantasyPlayerCards,
} from '@/server/fantasy/catalogue';

export const metadata: Metadata = {
  title: 'Build Fantasy Squad | GoalPlace256',
  description: 'Select a valid free fantasy squad before the trusted server deadline.',
};

export const dynamic = 'force-dynamic';

export default async function FantasyTeamPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const { competitionId } = await params;
  const bundle = await getFantasyCompetitionBundle(competitionId);
  if (!bundle) return <main className="p-8 text-center text-muted">Competition not found.</main>;
  const round = bundle.rounds.find((item) => item.status === 'open') ?? bundle.rounds[0];
  return (
    <FantasySquadBuilder
      competition={bundle.competition}
      players={await getFantasyPlayerCards(competitionId)}
      roundId={round.id}
      deadlineAt={round.deadlineAt}
    />
  );
}
