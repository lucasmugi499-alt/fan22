import type { Metadata } from 'next';
import { FantasyCompetitionOverview } from '@/components/fantasy/FantasyExperience';
import { fantasyCompetitions } from '@/data/fantasyDemo';
import { getFantasyCompetitionBundle } from '@/server/fantasy/catalogue';

export function generateStaticParams() {
  return fantasyCompetitions.map((competition) => ({ competitionId: competition.id }));
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}): Promise<Metadata> {
  const { competitionId } = await params;
  const competition = fantasyCompetitions.find((item) => item.id === competitionId);
  return {
    title: competition?.name ?? 'GoalPlace Fantasy Competition',
    description: competition
      ? `Build a free ${competition.sport} fantasy squad using verified GoalPlace256 records.`
      : 'GoalPlace Fantasy competition',
  };
}

export default async function FantasyCompetitionPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const { competitionId } = await params;
  const bundle = await getFantasyCompetitionBundle(competitionId);
  return <FantasyCompetitionOverview bundle={bundle} />;
}
