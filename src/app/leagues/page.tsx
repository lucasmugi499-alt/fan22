import { LeaguesDiscover } from "@/components/discover/LeaguesDiscover";
import { getPublicLeagueDiscoveryData } from "@/server/publicCatalogue";

export const dynamic = 'force-dynamic';

export default async function Page() {
  const data = await getPublicLeagueDiscoveryData();
  return <LeaguesDiscover {...data} />;
}
