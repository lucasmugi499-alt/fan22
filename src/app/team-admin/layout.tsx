import Link from 'next/link';

/**
 * Read-only sunset for the Team Admin console.
 *
 * ADR-004 retires Team Admin as an account class without deleting anything. The bundles were
 * versioned to zero capabilities, so every write from these screens is already refused by the
 * server and by Firestore Rules. This banner exists because a refusal with no explanation is
 * indistinguishable from a bug: somebody who ran their club here yesterday needs to be told
 * where their work went, not left guessing why a button stopped working.
 *
 * The screens themselves stay readable. All Team-Admin-created data is retained and remains
 * attributed, and an account is offered a destination rather than silently transformed into
 * something else.
 */
export default function TeamAdminSunsetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <aside
        role="status"
        className="rounded-2xl border border-amber-300/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-100"
      >
        <p className="font-semibold">Team administration has moved to League Operations.</p>
        <p className="mt-1 text-amber-100/80">
          Your league now manages rosters, athlete registration and results. Everything here
          stays visible and nothing you recorded has been removed, but this console is
          read-only. Ask your league for access, or{' '}
          <Link href="/support" className="underline underline-offset-2">
            contact support
          </Link>
          .
        </p>
      </aside>
      {children}
    </div>
  );
}
