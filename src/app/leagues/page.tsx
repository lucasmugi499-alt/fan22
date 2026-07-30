import { LeaguesDiscover } from "@/components/discover/LeaguesDiscover";
import { getPublicLeagues } from "@/server/publicCatalogue";

export default async function Page() {
  return <LeaguesDiscover initialLeagues={await getPublicLeagues()} />;
}
