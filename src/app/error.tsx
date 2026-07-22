'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import Link from 'next/link';
import { Alert01Icon, RefreshIcon } from 'hugeicons-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { PageContainer } from '@/components/ui/product';

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('Route error:', error);
  }, [error]);

  return (
    <PageContainer className="flex min-h-[60svh] items-center justify-center py-16">
      <div className="glass-panel w-full max-w-md rounded-2xl border border-red-500/20 p-8 text-center">
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-400">
          <Alert01Icon className="size-7" />
        </div>
        <h1 className="font-display text-2xl font-black tracking-tight text-white">Something went wrong</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          This section failed to load. Your data has not been affected — try again, or head back to your hub.
        </p>
        {error.digest && (
          <p className="mt-4 font-mono text-[11px] tracking-wider text-slate-600">Reference: {error.digest}</p>
        )}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={() => unstable_retry()}>
            <RefreshIcon className="size-4" />
            Try again
          </Button>
          <Link href="/home" className={buttonVariants({ variant: 'outline' })}>
            Go to Home
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
