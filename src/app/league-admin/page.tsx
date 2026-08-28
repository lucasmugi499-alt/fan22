import type { Metadata } from 'next';
import { LeagueCommandCentre } from '@/components/league/LeagueCommandCentre';

export const metadata: Metadata = { title: 'Command · League Operations' };

export default function Page() {
  return <LeagueCommandCentre />;
}
