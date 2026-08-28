import { redirect } from 'next/navigation';
import { legacyAdminTarget } from '@/lib/platform/adminRoutes';

export default async function AdminTeamsPage({ searchParams }: PageProps<'/admin/teams'>) {
  redirect(legacyAdminTarget('/admin/teams', await searchParams));
}
