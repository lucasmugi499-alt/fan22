import { AthletesDiscover } from "@/components/discover/AthletesDiscover";
import { PreviewDataNotice } from "@/components/ui/PreviewDataNotice";
import { getPublicAthletes } from "@/server/publicCatalogue";

export const dynamic = 'force-dynamic';

export default async function Page() {
  const { data: initialAthletes, source } = await getPublicAthletes();
  return (
    <>
      <PreviewDataNotice source={source} className="mx-auto mt-3 w-[min(100%-2rem,72rem)]" />
      <AthletesDiscover initialAthletes={initialAthletes} />
    </>
  );
}
