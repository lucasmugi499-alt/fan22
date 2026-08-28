import { TeamWorkbench } from '@/components/platform/workbenches/TeamWorkbench';

type Props = {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ tab?: string | string[]; command?: string | string[] }>;
};

export default async function TeamWorkbenchPage({ params, searchParams }: Props) {
  const [{ teamId }, query] = await Promise.all([params, searchParams]);
  return <TeamWorkbench id={teamId} tab={typeof query.tab === 'string' ? query.tab : undefined} command={typeof query.command === 'string' ? query.command : undefined} />;
}
