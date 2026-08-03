import { LeaguesDiscover } from "@/components/discover/LeaguesDiscover";
import { PreviewDataNotice } from "@/components/ui/PreviewDataNotice";
import { getPublicLeagueDiscoveryData } from "@/server/publicCatalogue";

export const dynamic = 'force-dynamic';

export default async function Page() {
  const { data, source } = await getPublicLeagueDiscoveryData();
  return (
    <>
      <PreviewDataNotice source={source} className="mx-auto mt-3 w-[min(100%-2rem,72rem)]" />
      <LeaguesDiscover {...data} />
    </>
  );
}
