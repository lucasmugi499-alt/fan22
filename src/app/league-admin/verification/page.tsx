import { redirect } from 'next/navigation';

/**
 * Verification folded into Matches → Needs review.
 *
 * The component this route rendered was already mounted inside the landing page, so the same
 * screen existed at two addresses. Exceptions are a state a match is in, not a separate place.
 */
export default function Page() {
  redirect('/league-admin/matches?filter=review');
}
