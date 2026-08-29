import { redirect } from 'next/navigation';

/**
 * Field mode was never a Team Admin capability, and is now not reachable as one.
 *
 * Live match capture belongs to a Field Manager the league assigns per fixture. That
 * principal has no Firebase account at all: they arrive through `/m/{secret}`, authenticate
 * with a PIN against a hashed secret, and hold a server-side session with no `accessIndex`
 * entry. There is no version of "the club opens field mode" that the authority model permits,
 * and ADR-004 removed the last capability that made it look otherwise.
 *
 * Redirecting rather than deleting, because the route was in the navigation until now and
 * somebody has it bookmarked. Fixtures is where they were trying to get to.
 */
export default function TeamFieldModePage() {
  redirect('/team-admin/fixtures');
}
