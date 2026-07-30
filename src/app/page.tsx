import type { Metadata } from 'next';

import { Landing } from '@/components/marketing/Landing';
import { getPublicLandingData } from '@/server/publicCatalogue';

export const metadata: Metadata = {
  title: 'Grassroots sport. One trusted home.',
  description:
    'Follow verified grassroots leagues, fixtures, results, and rising athletes across Uganda on GoalPlace256.',
};

export const dynamic = 'force-dynamic';

export default async function Page() {
  const initialData = await getPublicLandingData();
  return (
    <Landing initialData={initialData} />
  );
}
