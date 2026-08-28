import { redirect } from 'next/navigation';
import { legacyAdminEntityTarget } from '@/lib/platform/adminRoutes';

export default async function AdminTeamDetailPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  redirect(legacyAdminEntityTarget('team', teamId));
}
