"use client";

import { useParams } from "next/navigation";
import { LeaguePublic } from "@/components/core/LeaguePublic";

export default function Page() {
  const params = useParams<{ leagueId: string }>();
  return <LeaguePublic leagueId={params.leagueId} />;
}
