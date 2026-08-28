import type { Metadata } from 'next';
import { LeagueCompetition } from '@/components/league/LeagueCompetition';

export const metadata: Metadata = { title: 'Competition · League Operations' };

export default function Page() {
  return <LeagueCompetition />;
}
