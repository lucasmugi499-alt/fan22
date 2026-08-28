import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LeagueAthletes } from '@/components/league/LeagueAthletes';

export const metadata: Metadata = { title: 'Athletes · League Operations' };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LeagueAthletes />
    </Suspense>
  );
}
