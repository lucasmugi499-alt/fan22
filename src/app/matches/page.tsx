import { MatchesBrowser } from "@/components/discover/MatchesBrowser";
import { PreviewDataNotice } from "@/components/ui/PreviewDataNotice";
import { getPublicMatchesWithTeams } from "@/server/publicCatalogue";

export const dynamic = 'force-dynamic';

export default async function Page() {
  /**
   * One read, so the clubs are the ones these matches reference.
   *
   * This used to be `getPublicMatches()` alongside `getPublicTeams()`, which returns the 80
   * most recently created clubs. The demo database has 141, so 61 were missing from the lookup
   * and every fixture involving one rendered as "Team vs Team".
   */
  const { data, source } = await getPublicMatchesWithTeams();
  return (
    <>
      <PreviewDataNotice source={source} className="mx-auto mt-3 w-[min(100%-2rem,72rem)]" />
      <MatchesBrowser initialMatches={data.matches} initialTeams={data.teams} />
    </>
  );
}
