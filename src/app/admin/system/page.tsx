import { redirect } from 'next/navigation';
import { legacyAdminTarget } from '@/lib/platform/adminRoutes';

export default async function AdminSystemPage({ searchParams }: PageProps<'/admin/system'>) {
  redirect(legacyAdminTarget('/admin/system', await searchParams));
}
