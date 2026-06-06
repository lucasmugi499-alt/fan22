import { Suspense } from 'react';
import RegisterClient from './RegisterClient';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const params = await searchParams;

  return (
    <Suspense>
      <RegisterClient initialRole={params.role ?? 'fan'} />
    </Suspense>
  );
}
