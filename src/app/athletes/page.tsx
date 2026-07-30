import { AthletesDiscover } from "@/components/discover/AthletesDiscover";
import { getPublicAthletes } from "@/server/publicCatalogue";

export default async function Page() {
  return <AthletesDiscover initialAthletes={await getPublicAthletes()} />;
}
