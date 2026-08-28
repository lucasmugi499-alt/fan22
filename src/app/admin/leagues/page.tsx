import { redirect } from 'next/navigation';
import { legacyAdminTarget } from '@/lib/platform/adminRoutes';

export default async function AdminLeaguesPage({ searchParams }: PageProps<'/admin/leagues'>) {
  redirect(legacyAdminTarget('/admin/leagues', await searchParams));
}
