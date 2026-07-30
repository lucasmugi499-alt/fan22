import type { Metadata } from 'next';
import { FantasyPoints } from '@/components/fantasy/FantasyExperience';
import { fantasyCompetitions } from '@/data/fantasyDemo';
import { getFantasyCompetitionBundle } from '@/server/fantasy/catalogue';

export const metadata: Metadata = {
  title: 'Fantasy Points Centre | GoalPlace256',
  description: 'See provisional, official and corrected Fantasy Points with verified scoring explanations.',
};

export function generateStaticParams() {
  return fantasyCompetitions.map((competition) => ({ competitionId: competition.id }));
}

export default async function FantasyPointsPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const { competitionId } = await params;
  return <FantasyPoints bundle={await getFantasyCompetitionBundle(competitionId)} />;
}
