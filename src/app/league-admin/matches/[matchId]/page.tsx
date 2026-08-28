import type { Metadata } from 'next';
import { LeagueMatchDetail } from '@/components/league/LeagueMatchDetail';

export const metadata: Metadata = { title: 'Match · League Operations' };

export default async function Page({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  return <LeagueMatchDetail matchId={matchId} />;
}
