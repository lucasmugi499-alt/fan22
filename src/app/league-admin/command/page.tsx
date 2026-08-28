import { redirect } from 'next/navigation';

/**
 * The orphaned Command page.
 *
 * It was never in the navigation and rendered an exception queue hardcoded to an empty array,
 * so it could not display a case even in principle. Command is now the landing page.
 */
export default function Page() {
  redirect('/league-admin');
}
