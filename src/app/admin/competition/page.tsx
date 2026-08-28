import { redirect } from 'next/navigation';
import { legacyAdminTarget } from '@/lib/platform/adminRoutes';

export default async function AdminCompetitionPage({ searchParams }: PageProps<'/admin/competition'>) {
  redirect(legacyAdminTarget('/admin/competition', await searchParams));
}
