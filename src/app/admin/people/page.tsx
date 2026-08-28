import { redirect } from 'next/navigation';
import { legacyAdminTarget } from '@/lib/platform/adminRoutes';

export default async function AdminPeoplePage({ searchParams }: PageProps<'/admin/people'>) {
  redirect(legacyAdminTarget('/admin/people', await searchParams));
}
