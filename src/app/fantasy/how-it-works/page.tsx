import type { Metadata } from 'next';
import { FantasyHowItWorks } from '@/components/fantasy/FantasyExperience';

export const metadata: Metadata = {
  title: 'How GoalPlace Fantasy Works',
  description: 'See how free fantasy squads turn verified official performances into transparent points.',
};

export default function FantasyHowItWorksPage() {
  return <FantasyHowItWorks />;
}
