import { redirect } from 'next/navigation';
import { legacyAdminEntityTarget } from '@/lib/platform/adminRoutes';

export default async function AdminPersonDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  redirect(legacyAdminEntityTarget('person', userId));
}
