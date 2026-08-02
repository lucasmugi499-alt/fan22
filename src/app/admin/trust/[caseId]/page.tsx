import { PlatformEntityDetail } from '@/components/platform/details/PlatformEntityDetail';

export default async function AdminTrustCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <PlatformEntityDetail kind="trust" id={decodeURIComponent(caseId)} />;
}
