import type { Metadata } from 'next';
import { FantasyHub } from '@/components/fantasy/FantasyExperience';
import { getFantasyHubCatalogue } from '@/server/fantasy/catalogue';

export const metadata: Metadata = {
  title: 'GoalPlace Fantasy | Free football, basketball and rugby fantasy',
  description: 'Build a free fantasy squad and score only from verified GoalPlace256 match records.',
};

export default async function FantasyPage() {
  const catalogue = await getFantasyHubCatalogue();
  return <FantasyHub {...catalogue} />;
}
