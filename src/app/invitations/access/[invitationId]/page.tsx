import { AccessInvitationAcceptance } from '@/components/auth/AdminAccess';

export default async function AccessInvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ invitationId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { invitationId } = await params;
  const { token = '' } = await searchParams;
  return <AccessInvitationAcceptance invitationId={invitationId} token={token} />;
}
