import { MatchWorkbench } from '@/components/platform/workbenches/MatchWorkbench';

type Props = {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ tab?: string | string[]; command?: string | string[] }>;
};

export default async function MatchWorkbenchPage({ params, searchParams }: Props) {
  const [{ matchId }, query] = await Promise.all([params, searchParams]);
  return <MatchWorkbench id={matchId} tab={typeof query.tab === 'string' ? query.tab : undefined} command={typeof query.command === 'string' ? query.command : undefined} />;
}
