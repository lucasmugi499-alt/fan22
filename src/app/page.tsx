import type { Metadata } from 'next';

import { Landing } from '@/components/marketing/Landing';

export const metadata: Metadata = {
  title: 'Grassroots sport. One trusted home.',
  description:
    'Follow verified grassroots leagues, fixtures, results, and rising athletes across Uganda on GoalPlace256.',
};

export default function Page() {
  return <Landing />;
}
