import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LeagueMatches } from '@/components/league/LeagueMatches';

export const metadata: Metadata = { title: 'Matches · League Operations' };

export default function Page() {
  // useSearchParams needs a boundary; the workspace deep-links from the Command Centre.
  return (
    <Suspense fallback={null}>
      <LeagueMatches />
    </Suspense>
  );
}
