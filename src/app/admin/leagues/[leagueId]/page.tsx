import { redirect } from 'next/navigation';
import { legacyAdminEntityTarget } from '@/lib/platform/adminRoutes';

export default async function AdminLeagueDetailPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  redirect(legacyAdminEntityTarget('league', leagueId));
}
