"use client";

import { useParams } from "next/navigation";
import { AthleteProfile } from "@/components/core/AthleteProfile";

export default function Page() {
  const params = useParams<{ athleteId: string }>();
  return <AthleteProfile athleteId={params.athleteId} />;
}
