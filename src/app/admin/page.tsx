import { PlatformDesk } from '@/components/platform/desk/PlatformDesk';

const FILTERS = new Set(['all', 'mine', 'applications', 'integrity', 'trust', 'money', 'history']);

export default async function Page({ searchParams }: PageProps<'/admin'>) {
  const requested = (await searchParams).tab;
  const filter = typeof requested === 'string' && FILTERS.has(requested) ? requested : 'all';
  return <PlatformDesk initialFilter={filter} />;
}
