"use client";

import { useParams } from "next/navigation";
import { TeamPublic } from "@/components/core/TeamPublic";

export default function Page() {
  const params = useParams<{ teamId: string }>();
  return <TeamPublic teamId={params.teamId} />;
}
