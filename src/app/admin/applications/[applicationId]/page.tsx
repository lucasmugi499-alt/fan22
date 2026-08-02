import { PlatformEntityDetail } from '@/components/platform/details/PlatformEntityDetail';

export default async function AdminApplicationDetailPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  return <PlatformEntityDetail kind="application" id={decodeURIComponent(applicationId)} />;
}
