import { TeamsDiscover } from "@/components/discover/TeamsDiscover";
import { getPublicTeams } from "@/server/publicCatalogue";

export default async function Page() {
  return <TeamsDiscover initialTeams={await getPublicTeams()} />;
}
