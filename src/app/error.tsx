'use client';

import { Warning } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card className="mx-auto max-w-xl border-[color:var(--state-error)] p-6 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--state-error),transparent_86%)] text-[var(--state-error)]">
        <Warning className="h-6 w-6" weight="bold" />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-text-strong">This page could not load</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        Your navigation and session are still available. Try loading the page again.
      </p>
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
