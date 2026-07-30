import { Suspense } from 'react';
import { MatchDetail } from '@/components/core/MatchDetail';
import { Skeleton } from '@/components/ui/Skeleton';
import { matches } from '@/data/mockDatabase';

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
  return (
    <Suspense fallback={<MatchDetailFallback />}>
      <MatchDetail matchId={matchId} />
    </Suspense>
  );
}

function MatchDetailFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-52 w-full rounded-[var(--radius-xl)]" />
      <Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" />
    </div>
  );
}
