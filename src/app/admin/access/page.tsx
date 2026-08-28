import { redirect } from 'next/navigation';
import { legacyAdminTarget } from '@/lib/platform/adminRoutes';

export default async function AdminAccessPage({ searchParams }: PageProps<'/admin/access'>) {
  redirect(legacyAdminTarget('/admin/access', await searchParams));
}
