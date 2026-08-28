import { redirect } from 'next/navigation';
import { legacyAdminTarget } from '@/lib/platform/adminRoutes';

export default async function AdminAthletesPage({ searchParams }: PageProps<'/admin/athletes'>) {
  redirect(legacyAdminTarget('/admin/athletes', await searchParams));
}
