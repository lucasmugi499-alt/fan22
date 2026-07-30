import { LeaguePublic } from "@/components/core/LeaguePublic";
import { leagues } from "@/data/mockDatabase";
import { getPublicLeagueProfileData } from "@/server/publicCatalogue";

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
  return <LeaguePublic leagueId={leagueId} initialData={await getPublicLeagueProfileData(leagueId)} />;
}
