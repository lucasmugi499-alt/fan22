import { redirect } from 'next/navigation';
import { legacyAdminTarget } from '@/lib/platform/adminRoutes';

export default async function AdminApplicationsPage({ searchParams }: PageProps<'/admin/applications'>) {
  redirect(legacyAdminTarget('/admin/applications', await searchParams));
}
