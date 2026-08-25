import { MatchOpsClient } from '@/components/matchops/MatchOpsClient';

/**
 * The Field Manager's entire surface, reached from a link with a one-time secret in it.
 *
 * Deliberately outside the application shell. There is no navigation, no role switcher and no
 * way to wander into the rest of the platform: this person is not an account holder, they are
 * here for one match, and every control that is not about that match is a control they can
 * press by accident while running one.
 */
export const metadata = { title: 'Match Ops', robots: { index: false, follow: false } };

export default async function MatchOpsPage({ params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  // Handed to the client and never used server-side: exchanging it for a session is a
  // mutation, and it belongs on the POST that also carries the PIN.
  return <MatchOpsClient bootstrapSecret={secret} />;
}
