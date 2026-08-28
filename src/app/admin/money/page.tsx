import { FinancialOperations } from '@/components/platform/FinancialOperations';
import { PlatformReports } from '@/components/platform/PlatformReports';
import { SponsorReport } from '@/components/platform/SponsorReport';
import { WorkspaceTabs } from '@/components/platform/WorkspaceTabs';

const TABS = [
  { id: 'allocations', label: 'Allocations', href: '/admin/money?tab=allocations' },
  { id: 'payees', label: 'Payees', href: '/admin/money?tab=payees' },
  { id: 'holds', label: 'Holds', href: '/admin/money?tab=holds' },
  { id: 'sponsors', label: 'Sponsors', href: '/admin/money?tab=sponsors' },
  { id: 'reports', label: 'Reports', href: '/admin/money?tab=reports' },
] as const;

export default async function MoneyPage({ searchParams }: PageProps<'/admin/money'>) {
  const requested = (await searchParams).tab;
  const tab = typeof requested === 'string' && TABS.some((item) => item.id === requested) ? requested : 'allocations';
  return (
    <section className="space-y-5">
      <WorkspaceTabs label="Money sections" tabs={[...TABS]} active={tab} />
      {tab === 'sponsors' ? <SponsorReport /> : tab === 'reports' ? <PlatformReports /> : <FinancialOperations />}
    </section>
  );
}
