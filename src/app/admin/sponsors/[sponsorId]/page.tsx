import { PlatformEntityDetail } from '@/components/platform/details/PlatformEntityDetail';

export default async function AdminSponsorDetailPage({ params }: { params: Promise<{ sponsorId: string }> }) {
  const { sponsorId } = await params;
  return <PlatformEntityDetail kind="sponsor" id={decodeURIComponent(sponsorId)} />;
}
