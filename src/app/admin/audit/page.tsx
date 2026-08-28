import { redirect } from 'next/navigation';
import { legacyAdminTarget } from '@/lib/platform/adminRoutes';

export default async function AdminAuditPage({ searchParams }: PageProps<'/admin/audit'>) {
  redirect(legacyAdminTarget('/admin/audit', await searchParams));
}
