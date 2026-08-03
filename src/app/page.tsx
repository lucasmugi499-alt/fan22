import type { Metadata } from 'next';

import { Landing } from '@/components/marketing/Landing';
import { PreviewDataNotice } from '@/components/ui/PreviewDataNotice';
import { getPublicLandingData } from '@/server/publicCatalogue';

export const metadata: Metadata = {
  title: 'Grassroots sport. One trusted home.',
  description:
    'Follow verified grassroots leagues, fixtures, results, and rising athletes across Uganda on GoalPlace256.',
};

export const dynamic = 'force-dynamic';

export default async function Page() {
  const { data: initialData, source } = await getPublicLandingData();
  return (
    <>
      <PreviewDataNotice source={source} className="mx-auto mt-3 w-[min(100%-2rem,72rem)]" />
      <Landing initialData={initialData} />
    </>
  );
}
