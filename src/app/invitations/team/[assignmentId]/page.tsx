import { TeamInvitationAcceptance } from '@/components/auth/AdminAccess';

export default async function TeamInvitationPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  return <TeamInvitationAcceptance assignmentId={assignmentId} />;
}
