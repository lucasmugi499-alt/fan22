import type { Metadata } from 'next';
import { FantasyMiniLeagueDetailLoader } from '@/components/fantasy/FantasyMiniLeagueDetailLoader';
import { getFantasyMiniLeague } from '@/server/fantasy/catalogue';

export const metadata: Metadata = {
  title: 'Fantasy Mini-League | GoalPlace256',
  description: 'A free GoalPlace Fantasy mini-league table.',
};

export const dynamic = 'force-dynamic';

export default async function FantasyMiniLeaguePage({
  params,
}: {
  params: Promise<{ miniLeagueId: string }>;
}) {
  const { miniLeagueId } = await params;
  const catalogue = await getFantasyMiniLeague(miniLeagueId);
  return (
    <FantasyMiniLeagueDetailLoader
      miniLeagueId={miniLeagueId}
      initialCatalogue={catalogue}
    />
  );
}
