import { LeaguePublic } from "@/components/core/LeaguePublic";
import { leagues } from "@/data/mockLeagues";

export function generateStaticParams() {
  if (process.env.NEXT_STATIC_EXPORT !== "true") return [];
  return leagues.map((league) => ({ leagueId: league.id }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  return <LeaguePublic leagueId={leagueId} />;
}
