import { Suspense } from 'react';
import { AthleteProfile } from "@/components/core/AthleteProfile";
import { Skeleton } from '@/components/ui/Skeleton';
import { athletes } from "@/data/mockDatabase";

export function generateStaticParams() {
  if (process.env.NEXT_STATIC_EXPORT !== "true") return [];
  return athletes.map((athlete) => ({ athleteId: athlete.id }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const { athleteId } = await params;
  return (
    <Suspense fallback={<AthleteProfileFallback />}>
      <AthleteProfile athleteId={athleteId} />
    </Suspense>
  );
}

function AthleteProfileFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-36 w-full rounded-[var(--radius-xl)]" />
      <Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" />
    </div>
  );
}
