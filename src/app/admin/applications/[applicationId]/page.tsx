import { redirect } from 'next/navigation';
import { legacyAdminEntityTarget } from '@/lib/platform/adminRoutes';

export default async function AdminApplicationDetailPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  redirect(legacyAdminEntityTarget('application', applicationId));
}
