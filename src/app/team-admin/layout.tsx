import { ClubAuthorityNotice } from '@/components/team/ClubAuthorityNotice';

/**
 * The club console. Club Operators run their club here; everybody else reads it.
 *
 * This layout used to carry a sunset banner from ADR-004 — "Team administration has moved to
 * League Operations" — rendered for everyone, because a server layout has no idea who is
 * reading it. Under ADR-005 that banner sat above screens asking a Club Operator to act, which
 * is the contradiction the audit called out: two true statements about two different people,
 * shown to one person.
 *
 * The notice now lives in `ClubAuthorityNotice`, a client component that asks the same access
 * hook the screens ask, and says something only to a viewer who cannot act.
 */
export default function ClubConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <ClubAuthorityNotice />
      {children}
    </div>
  );
}
