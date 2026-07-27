import { TeamPublic } from "@/components/core/TeamPublic";
import { teams } from "@/data/mockDatabase";

export function generateStaticParams() {
  if (process.env.NEXT_STATIC_EXPORT !== "true") return [];
  return teams.map((team) => ({ teamId: team.id }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  return <TeamPublic teamId={teamId} />;
}
