import { SignIn } from '@/components/marketing/SignIn';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const value = (await searchParams).next;
  return <SignIn initialMode="register" nextPath={Array.isArray(value) ? value[0] : value} />;
}
