'use client';

import { useParams } from 'next/navigation';
import { MatchDetail } from '@/components/core/MatchDetail';

export default function MatchDetailPage() {
  const params = useParams<{ matchId: string }>();
  return <MatchDetail matchId={params.matchId} />;
}
