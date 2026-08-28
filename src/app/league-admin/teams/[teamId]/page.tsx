import type { Metadata } from 'next';
import { LeagueTeamDetail } from '@/components/league/LeagueTeamDetail';

export const metadata: Metadata = { title: 'Team · League Operations' };

export default async function Page({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  return <LeagueTeamDetail teamId={teamId} />;
}
