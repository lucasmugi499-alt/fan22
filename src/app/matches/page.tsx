import { MatchesBrowser } from "@/components/discover/MatchesBrowser";
import { getPublicMatches, getPublicTeams } from "@/server/publicCatalogue";

export default async function Page() {
  const [matches, teams] = await Promise.all([getPublicMatches(), getPublicTeams()]);
  return <MatchesBrowser initialMatches={matches} initialTeams={teams} />;
}
