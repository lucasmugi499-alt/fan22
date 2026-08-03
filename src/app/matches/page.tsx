import { MatchesBrowser } from "@/components/discover/MatchesBrowser";
import { PreviewDataNotice } from "@/components/ui/PreviewDataNotice";
import { getPublicMatches, getPublicTeams } from "@/server/publicCatalogue";

export const dynamic = 'force-dynamic';

export default async function Page() {
  const [matches, teams] = await Promise.all([getPublicMatches(), getPublicTeams()]);
  // Either read may have fallen back; disclose if either did.
  const source = [matches.source, teams.source].includes('curated_preview') ? 'curated_preview' : matches.source;
  return (
    <>
      <PreviewDataNotice source={source} className="mx-auto mt-3 w-[min(100%-2rem,72rem)]" />
      <MatchesBrowser initialMatches={matches.data} initialTeams={teams.data} />
    </>
  );
}
