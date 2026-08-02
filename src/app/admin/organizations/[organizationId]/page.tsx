import { PlatformEntityDetail } from '@/components/platform/details/PlatformEntityDetail';

export default async function AdminOrganizationDetailPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <PlatformEntityDetail kind="league" id={decodeURIComponent(organizationId)} />;
}
