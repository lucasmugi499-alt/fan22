import { redirect } from 'next/navigation';
import { legacyAdminEntityTarget } from '@/lib/platform/adminRoutes';

export default async function AdminSponsorDetailPage({ params }: { params: Promise<{ sponsorId: string }> }) {
  const { sponsorId } = await params;
  redirect(legacyAdminEntityTarget('sponsor', sponsorId));
}
