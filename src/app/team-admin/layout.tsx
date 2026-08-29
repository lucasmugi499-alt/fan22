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
 *
 * This banner alone was not enough, and for a while it made things worse. The screens beneath
 * it kept rendering every write control they always had — Create and invite, Build roster,
 * Save profile, Publish update, Submit result — so the page said "read-only" and then offered
 * a working Save button. A control that contradicts the notice above it is a control that
 * lies twice, and the second lie undoes the first. Those controls now render only when
 * `useTeamConsoleAccess` says the viewer holds the capability the server will check.
 *
 * Which is also why the wording no longer claims the console is read-only FOR EVERYONE. A
 * league operator holding `league.team.manage` for this club reaches these same screens and
 * can legitimately write here. The notice states where authority moved — a fact about the
 * model — rather than asserting a permission the reader may not lack.
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
          stays visible and nothing you recorded has been removed. If you need to change
          something, ask your league, or{' '}
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
