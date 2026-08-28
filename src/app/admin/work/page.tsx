import { redirect } from 'next/navigation';
import { legacyAdminTarget } from '@/lib/platform/adminRoutes';

export default async function AdminWorkPage({ searchParams }: PageProps<'/admin/work'>) {
  redirect(legacyAdminTarget('/admin/work', await searchParams));
}
