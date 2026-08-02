import type { Metadata } from 'next';
import { FantasyMiniLeagues } from '@/components/fantasy/FantasyMiniLeagues';
import { getFantasyMiniLeagueCatalogue } from '@/server/fantasy/catalogue';
import { getFantasyCompetitions } from '@/server/fantasy/catalogue';

export const metadata: Metadata = {
  title: 'Fantasy Mini-Leagues | GoalPlace256',
  description: 'Create or join a free private fantasy mini-league with no entry fee or cash pool.',
};

export const dynamic = 'force-dynamic';

export default async function FantasyMiniLeaguesPage() {
  const [catalogue, competitions] = await Promise.all([
    getFantasyMiniLeagueCatalogue(),
    getFantasyCompetitions(),
  ]);
  return <FantasyMiniLeagues miniLeagues={catalogue.miniLeagues} memberCounts={catalogue.memberCounts} competitions={competitions} />;
}
