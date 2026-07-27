import { MatchDetail } from '@/components/core/MatchDetail';
import { matches } from '@/data/mockDatabase';

export function generateStaticParams() {
  if (process.env.NEXT_STATIC_EXPORT !== 'true') return [];
  return matches.map((match) => ({ matchId: match.id }));
}

export default async function MatchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ attendance?: string }>;
}) {
  const { matchId } = await params;
  const { attendance } = await searchParams;
  return <MatchDetail matchId={matchId} attendanceToken={attendance} />;
}
