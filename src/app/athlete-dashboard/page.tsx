import { redirect } from 'next/navigation';

/**
 * `/athlete-dashboard` was the one role surface that broke the slug convention.
 *
 * Every other persona lives at its role name — `/league-admin`, `/team-admin`, `/sponsors` —
 * and this one carried a `-dashboard` suffix describing the page rather than the person. Small
 * on its own, and the kind of inconsistency that gets copied: the next role added would have
 * had to guess which of the two patterns to follow.
 *
 * Redirecting rather than deleting, because the path was in the navigation, in `robots.ts`,
 * and is very likely bookmarked by every athlete who has ever signed in.
 */
export default function AthleteDashboardRedirect() {
  redirect('/athlete');
}
