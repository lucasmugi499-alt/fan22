import { UserCircleDashed } from '@phosphor-icons/react/dist/ssr';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Shown when a signed-in user has no entity assigned to them. Outside demo mode the app
 * deliberately refuses to guess: opening an unrelated club, league or athlete record would
 * misrepresent whose data you are looking at.
 */
export function NoAssignment({ kind }: { kind: 'team' | 'league' | 'athlete' }) {
  const copy = {
    team: {
      title: 'No team linked to your account',
      description:
        'Your account is not yet attached to a team. Ask your league admin to add you as a team admin, then this console will fill with your club.',
    },
    league: {
      title: 'No league linked to your account',
      description:
        'Your account is not yet attached to a league. Once a platform admin assigns you, your league desk appears here.',
    },
    athlete: {
      title: 'No athlete profile linked',
      description:
        'Your account is not yet linked to an athlete record. Ask your team admin to connect it, then your career portfolio appears here.',
    },
  }[kind];

  return <EmptyState icon={UserCircleDashed} title={copy.title} description={copy.description} />;
}
