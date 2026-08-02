import { PlatformEntityDetail } from '@/components/platform/details/PlatformEntityDetail';

export default async function AdminTeamDetailPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  return <PlatformEntityDetail kind="team" id={decodeURIComponent(teamId)} />;
}
