import { AthleteWorkbench } from '@/components/platform/workbenches/AthleteWorkbench';

type Props = {
  params: Promise<{ athleteId: string }>;
  searchParams: Promise<{ tab?: string | string[]; command?: string | string[] }>;
};

export default async function AthleteWorkbenchPage({ params, searchParams }: Props) {
  const [{ athleteId }, query] = await Promise.all([params, searchParams]);
  return <AthleteWorkbench id={athleteId} tab={typeof query.tab === 'string' ? query.tab : undefined} command={typeof query.command === 'string' ? query.command : undefined} />;
}
