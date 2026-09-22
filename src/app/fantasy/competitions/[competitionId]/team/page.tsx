import type { Metadata } from 'next';
import { FantasySquadBuilder } from '@/components/fantasy/FantasySquadBuilder';
import {
  getFantasyCompetitionBundle,
  getFantasyPlayerCards,
} from '@/server/fantasy/catalogue';

export const metadata: Metadata = {
  title: 'Build Fantasy Squad',
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
  /*
   * The open round, else the next one to open, else whatever is first. Only the open round
   * accepts a squad; the builder is told which case it is in rather than left to discover it
   * from a 409 after fifteen picks.
   */
  const round = bundle.rounds.find((item) => item.status === 'open')
    ?? bundle.rounds.find((item) => item.status === 'upcoming')
    ?? bundle.rounds[0];
  if (!round) return <main className="p-8 text-center text-muted">No rounds are published for this competition yet.</main>;
  return (
    <FantasySquadBuilder
      competition={bundle.competition}
      players={await getFantasyPlayerCards(competitionId)}
      roundId={round.id}
      roundName={round.name}
      roundStatus={round.status}
      deadlineAt={round.deadlineAt}
    />
  );
}
