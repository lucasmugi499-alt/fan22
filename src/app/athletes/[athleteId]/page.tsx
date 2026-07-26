import { AthleteProfile } from "@/components/core/AthleteProfile";
import { athletes } from "@/data/mockAthletes";

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
  return <AthleteProfile athleteId={athleteId} />;
}
