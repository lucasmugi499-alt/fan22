import { LeagueWorkbench } from '@/components/platform/workbenches/LeagueWorkbench';

type Props = {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ tab?: string | string[]; command?: string | string[] }>;
};

export default async function LeagueWorkbenchPage({ params, searchParams }: Props) {
  const [{ leagueId }, query] = await Promise.all([params, searchParams]);
  return <LeagueWorkbench id={leagueId} tab={typeof query.tab === 'string' ? query.tab : undefined} command={typeof query.command === 'string' ? query.command : undefined} />;
}
