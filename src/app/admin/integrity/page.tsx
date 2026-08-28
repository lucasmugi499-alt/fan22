import { AuditExplorer } from '@/components/platform/audit/AuditExplorer';
import { IntegrityOperations } from '@/components/platform/integrity/IntegrityOperations';
import { PlatformTrust } from '@/components/platform/PlatformTrust';
import { WorkspaceTabs } from '@/components/platform/WorkspaceTabs';

const TABS = [
  { id: 'live', label: 'Live', href: '/admin/integrity?tab=live' },
  { id: 'escalations', label: 'Escalations', href: '/admin/integrity?tab=escalations' },
  { id: 'quality', label: 'Quality', href: '/admin/integrity?tab=quality' },
  { id: 'trust', label: 'Trust', href: '/admin/integrity?tab=trust' },
  { id: 'audit', label: 'Audit', href: '/admin/integrity?tab=audit' },
] as const;

export default async function IntegrityPage({ searchParams }: PageProps<'/admin/integrity'>) {
  const requested = (await searchParams).tab;
  const tab = typeof requested === 'string' && TABS.some((item) => item.id === requested) ? requested : 'live';
  return (
    <section className="space-y-5">
      <WorkspaceTabs label="Integrity sections" tabs={[...TABS]} active={tab} />
      {tab === 'trust' ? <PlatformTrust /> : tab === 'audit' ? <AuditExplorer /> : <IntegrityOperations view={tab as 'live' | 'escalations' | 'quality'} />}
    </section>
  );
}
