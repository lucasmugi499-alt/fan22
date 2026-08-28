import { ApplicationWorkbench } from '@/components/platform/applications/ApplicationWorkbench';

type Props = {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<{ command?: string | string[] }>;
};

export default async function ApplicationWorkbenchPage({ params, searchParams }: Props) {
  const [{ applicationId }, query] = await Promise.all([params, searchParams]);
  return <ApplicationWorkbench id={applicationId} initialCommand={typeof query.command === 'string' ? query.command : undefined} />;
}
