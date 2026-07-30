import type { Metadata } from 'next';
import { FantasyPoints } from '@/components/fantasy/FantasyExperience';
import { getFantasyCompetitionBundle } from '@/server/fantasy/catalogue';

export const metadata: Metadata = {
  title: 'Fantasy Points Centre | GoalPlace256',
  description: 'See provisional, official and corrected Fantasy Points with verified scoring explanations.',
};

export const dynamic = 'force-dynamic';

export default async function FantasyPointsPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const { competitionId } = await params;
  return <FantasyPoints bundle={await getFantasyCompetitionBundle(competitionId)} />;
}
