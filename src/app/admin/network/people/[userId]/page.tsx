import { PersonWorkbench } from '@/components/platform/workbenches/PersonWorkbench';

type Props = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ tab?: string | string[]; command?: string | string[] }>;
};

export default async function PersonWorkbenchPage({ params, searchParams }: Props) {
  const [{ userId }, query] = await Promise.all([params, searchParams]);
  return <PersonWorkbench id={userId} tab={typeof query.tab === 'string' ? query.tab : undefined} command={typeof query.command === 'string' ? query.command : undefined} />;
}
