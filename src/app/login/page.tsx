import { SignIn } from "@/components/marketing/SignIn";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const value = (await searchParams).next;
  return <SignIn nextPath={Array.isArray(value) ? value[0] : value} />;
}
