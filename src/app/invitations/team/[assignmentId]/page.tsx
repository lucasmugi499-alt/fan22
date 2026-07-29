import { TeamInvitationAcceptance } from '@/components/auth/AdminAccess';

export default async function TeamInvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { assignmentId } = await params;
  const { token = '' } = await searchParams;
  return <TeamInvitationAcceptance assignmentId={assignmentId} token={token} />;
}
