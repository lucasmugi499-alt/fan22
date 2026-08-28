import { AccessDirectory } from '@/components/platform/access/AccessDirectory';
import { ApplicationDirectory } from '@/components/platform/applications/ApplicationDirectory';
import { AthleteManagement } from '@/components/platform/network/AthleteManagement';
import { LeagueManagement } from '@/components/platform/network/LeagueManagement';
import { TeamManagement } from '@/components/platform/network/TeamManagement';
import { OrganizationDirectory } from '@/components/platform/organizations/OrganizationDirectory';
import { PeopleDirectory } from '@/components/platform/people/PeopleDirectory';
import { WorkspaceTabs } from '@/components/platform/WorkspaceTabs';

const TABS = [
  { id: 'leagues', label: 'Leagues', href: '/admin/network?tab=leagues' },
  { id: 'teams', label: 'Teams', href: '/admin/network?tab=teams' },
  { id: 'athletes', label: 'Athletes', href: '/admin/network?tab=athletes' },
  { id: 'organizations', label: 'Organizations', href: '/admin/network?tab=organizations' },
  { id: 'people', label: 'People', href: '/admin/network?tab=people' },
  { id: 'access', label: 'Access', href: '/admin/network?tab=access' },
  { id: 'applications', label: 'Applications', href: '/admin/network?tab=applications' },
] as const;

export default async function NetworkPage({ searchParams }: PageProps<'/admin/network'>) {
  const requested = (await searchParams).tab;
  const tab = typeof requested === 'string' && TABS.some((item) => item.id === requested) ? requested : 'leagues';
  return (
    <section className="space-y-5">
      <WorkspaceTabs label="Network sections" tabs={[...TABS]} active={tab} />
      {tab === 'teams' ? <TeamManagement />
        : tab === 'athletes' ? <AthleteManagement />
          : tab === 'organizations' ? <OrganizationDirectory />
            : tab === 'people' ? <PeopleDirectory />
              : tab === 'access' ? <AccessDirectory />
                : tab === 'applications' ? <ApplicationDirectory />
                  : <LeagueManagement />}
    </section>
  );
}
