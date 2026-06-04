import RegisterClient from './RegisterClient';

type Props = {
  searchParams: Promise<{ role?: string }>;
};

export default async function RegisterPage({ searchParams }: Props) {
  const params = await searchParams;
  return <RegisterClient initialRole={params.role ?? 'fan'} />;
}
