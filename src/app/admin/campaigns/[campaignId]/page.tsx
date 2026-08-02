import { PlatformEntityDetail } from '@/components/platform/details/PlatformEntityDetail';

export default async function AdminCampaignDetailPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  return <PlatformEntityDetail kind="campaign" id={decodeURIComponent(campaignId)} />;
}
