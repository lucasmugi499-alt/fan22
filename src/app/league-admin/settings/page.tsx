import type { Metadata } from 'next';
import { LeagueSettings } from '@/components/league/LeagueSettings';

export const metadata: Metadata = { title: 'Settings · League Operations' };

export default function Page() {
  return <LeagueSettings />;
}
