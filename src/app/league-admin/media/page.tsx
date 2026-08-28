import type { Metadata } from 'next';
import { LeagueMedia } from '@/components/league/LeagueMedia';

export const metadata: Metadata = { title: 'Media · League Operations' };

export default function Page() {
  return <LeagueMedia />;
}
