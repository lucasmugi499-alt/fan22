import { redirect } from 'next/navigation';
import { legacyAdminTarget } from '@/lib/platform/adminRoutes';

export default async function Page({ searchParams }: PageProps<'/admin/sponsors'>) {
  redirect(legacyAdminTarget('/admin/sponsors', await searchParams));
}
