import { ControlPlane } from '@/components/platform/control/ControlPlane';
import { AuditExplorer } from '@/components/platform/audit/AuditExplorer';
import { WebsiteSettings } from '@/components/platform/site/WebsiteSettings';
import { SystemHealth } from '@/components/platform/system/SystemHealth';
import { WorkspaceTabs } from '@/components/platform/WorkspaceTabs';

const TABS = [
  { id: 'site', label: 'Site', href: '/admin/platform?tab=site' },
  { id: 'controls', label: 'Controls', href: '/admin/platform?tab=controls' },
  { id: 'health', label: 'Health', href: '/admin/platform?tab=health' },
  { id: 'activations', label: 'Activations', href: '/admin/platform?tab=activations' },
  { id: 'audit', label: 'Audit', href: '/admin/platform?tab=audit' },
] as const;

export default async function PlatformPage({ searchParams }: PageProps<'/admin/platform'>) {
  const requested = (await searchParams).tab;
  const tab = typeof requested === 'string' && TABS.some((item) => item.id === requested) ? requested : 'site';
  return (
    <section className="space-y-5">
      <WorkspaceTabs label="Platform sections" tabs={[...TABS]} active={tab} />
      {tab === 'audit' ? <AuditExplorer /> : tab === 'health' ? <SystemHealth /> : tab === 'controls' || tab === 'activations' ? <ControlPlane /> : <WebsiteSettings />}
    </section>
  );
}
