import { redirect } from 'next/navigation';
import { legacyAdminTarget } from '@/lib/platform/adminRoutes';

export default async function AdminFinancePage({ searchParams }: PageProps<'/admin/finance'>) {
  redirect(legacyAdminTarget('/admin/finance', await searchParams));
}
