import { redirect } from 'next/navigation';
import { legacyAdminTarget } from '@/lib/platform/adminRoutes';

export default async function AdminOrganizationsPage({ searchParams }: PageProps<'/admin/organizations'>) {
  redirect(legacyAdminTarget('/admin/organizations', await searchParams));
}
