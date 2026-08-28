import { redirect } from 'next/navigation';

/**
 * Fixtures folded into Matches.
 *
 * The old page was a chronological list with no operational state. Matches answers the same
 * question and the three others a League Admin asks alongside it, so this redirects rather
 * than leaving two routes that disagree about what a fixture list is for.
 */
export default function Page() {
  redirect('/league-admin/matches');
}
