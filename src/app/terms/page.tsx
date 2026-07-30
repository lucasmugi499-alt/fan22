import type { Metadata } from 'next';
import { MarketingHero, MarketingShell } from '@/components/marketing/MarketingShell';

export const metadata: Metadata = { title: 'Terms | GoalPlace256' };

export default function TermsPage() {
  return (
    <MarketingShell>
      <MarketingHero eyebrow="Terms" title="Clear rules for a trusted sports community.">
        GoalPlace256 is currently a demonstration and pilot platform. Fantasy is free to play,
        Fantasy Credits have no cash value, and synthetic records are labelled as demonstration data.
      </MarketingHero>
      <section className="mx-auto max-w-3xl space-y-8 pb-20 text-sm leading-7 text-muted">
        <div><h2 className="text-lg font-semibold text-text-strong">Accounts</h2><p className="mt-2">Fan registration is self-service. Athlete and operational access requires an invitation, claim, or approval. Users must not misrepresent their identity, role, or official sporting record.</p></div>
        <div><h2 className="text-lg font-semibold text-text-strong">Official records</h2><p className="mt-2">Only trusted finalization creates official results. Corrections remain versioned and auditable. Fantasy rankings use official sporting records and never contribution activity.</p></div>
        <div><h2 className="text-lg font-semibold text-text-strong">Pilot status</h2><p className="mt-2">Payments, payouts, and provider settlement remain sandbox-only until legal, compliance, and production gates are complete.</p></div>
      </section>
    </MarketingShell>
  );
}
