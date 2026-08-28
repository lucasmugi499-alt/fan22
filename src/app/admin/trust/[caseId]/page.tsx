import { redirect } from 'next/navigation';
import { legacyAdminEntityTarget } from '@/lib/platform/adminRoutes';

export default async function AdminTrustCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  redirect(legacyAdminEntityTarget('trust', caseId));
}
