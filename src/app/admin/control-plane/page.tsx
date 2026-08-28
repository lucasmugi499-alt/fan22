import { redirect } from 'next/navigation';
import { legacyAdminTarget } from '@/lib/platform/adminRoutes';

export default async function AdminControlPlanePage({ searchParams }: PageProps<'/admin/control-plane'>) {
  redirect(legacyAdminTarget('/admin/control-plane', await searchParams));
}
