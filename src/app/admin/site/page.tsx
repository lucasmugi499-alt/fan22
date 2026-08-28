import { redirect } from 'next/navigation';
import { legacyAdminTarget } from '@/lib/platform/adminRoutes';

export default async function AdminSitePage({ searchParams }: PageProps<'/admin/site'>) {
  redirect(legacyAdminTarget('/admin/site', await searchParams));
}
