import { LeaguePublic } from "@/components/core/LeaguePublic";
import { PreviewDataNotice } from "@/components/ui/PreviewDataNotice";
import { leagues } from "@/data/mockDatabase";
import { getPublicLeagueProfileData } from "@/server/publicCatalogue";

export const dynamic = 'force-dynamic';

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
  const { data: initialData, source } = await getPublicLeagueProfileData(leagueId);
  return (
    <>
      <PreviewDataNotice source={source} className="mx-auto mt-3 w-[min(100%-2rem,72rem)]" />
      <LeaguePublic leagueId={leagueId} initialData={initialData} />
    </>
  );
}
