import type { Metadata } from 'next';
import { MarketingHero, MarketingShell } from '@/components/marketing/MarketingShell';

export const metadata: Metadata = { title: 'Privacy | GoalPlace256' };

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <MarketingHero eyebrow="Privacy" title="Collect less. Protect sporting identity.">
        GoalPlace256 separates public sports records from private account, operational, and
        compliance information.
      </MarketingHero>
      <section className="mx-auto max-w-3xl space-y-8 pb-20 text-sm leading-7 text-muted">
        <div><h2 className="text-lg font-semibold text-text-strong">Public records</h2><p className="mt-2">League, team, athlete, fixture, official result, and fantasy leaderboard information may be publicly visible when approved for publication.</p></div>
        <div><h2 className="text-lg font-semibold text-text-strong">Private records</h2><p className="mt-2">Account contact details, private mini-league membership, payout eligibility, precise location, and operational audit records are restricted by role and purpose.</p></div>
        <div><h2 className="text-lg font-semibold text-text-strong">Location and minors</h2><p className="mt-2">The public map displays venues, not athlete homes. Any future attendance validation will use coarse, short-lived evidence and will not retain precise fan location as a permanent profile field.</p></div>
      </section>
    </MarketingShell>
  );
}
