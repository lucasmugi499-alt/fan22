import { PlatformEntityDetail } from '@/components/platform/details/PlatformEntityDetail';

export default async function AdminLeagueDetailPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  return <PlatformEntityDetail kind="league" id={decodeURIComponent(leagueId)} />;
}
