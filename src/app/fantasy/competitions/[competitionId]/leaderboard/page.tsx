import type { Metadata } from 'next';
import { FantasyLeaderboard } from '@/components/fantasy/FantasyExperience';
import { getFantasyCompetitionBundle } from '@/server/fantasy/catalogue';

export const metadata: Metadata = {
  title: 'Official Fantasy Leaderboard | GoalPlace256',
  description: 'Free fantasy rankings calculated only from verified official match records.',
};

export const dynamic = 'force-dynamic';

export default async function FantasyLeaderboardPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const { competitionId } = await params;
  return <FantasyLeaderboard bundle={await getFantasyCompetitionBundle(competitionId)} />;
}
