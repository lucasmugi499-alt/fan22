import { TeamsDiscover } from "@/components/discover/TeamsDiscover";
import { getPublicLeagueDiscoveryData } from "@/server/publicCatalogue";

export default async function Page() {
  const data = await getPublicLeagueDiscoveryData();
  return <TeamsDiscover {...data} />;
}
