import { MatchDetail } from '@/components/core/MatchDetail';
import { matches } from '@/data/mockMatches';

export function generateStaticParams() {
  if (process.env.NEXT_STATIC_EXPORT !== 'true') return [];
  return matches.map((match) => ({ matchId: match.id }));
}

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  return <MatchDetail matchId={matchId} />;
}
