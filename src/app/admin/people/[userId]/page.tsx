import { PlatformEntityDetail } from '@/components/platform/details/PlatformEntityDetail';

export default async function AdminPersonDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <PlatformEntityDetail kind="person" id={decodeURIComponent(userId)} />;
}
