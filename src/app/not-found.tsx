import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { PageContainer } from '@/components/ui/product';

export const metadata = {
  title: 'Page not found',
};

export default function NotFound() {
  return (
    <PageContainer className="flex min-h-[60svh] items-center justify-center py-16">
      <div className="glass-panel w-full max-w-md rounded-2xl border border-white/10 p-8 text-center">
        <p className="font-display text-6xl font-black tracking-tight text-[var(--goal-mint)]">404</p>
        <h1 className="mt-4 font-display text-2xl font-black tracking-tight text-white">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          This page has moved or never existed. The match, team, or athlete you were looking for may no longer be listed.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/home" className={buttonVariants()}>
            Go to Home
          </Link>
          <Link href="/matches" className={buttonVariants({ variant: 'outline' })}>
            Browse Matches
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
