import { ShieldCheck, ChartLineUp, SealCheck } from '@phosphor-icons/react/dist/ssr';
import { MarketingShell, MarketingHero } from '@/components/marketing/MarketingShell';
import { PublicInquiryForm } from '@/components/marketing/PublicInquiryForm';

export function Sponsors() {
  return (
    <MarketingShell>
      <MarketingHero eyebrow="For sponsors" title={<>Reach you can <span className="text-brand">actually prove.</span></>}>
        Sponsorship works when the activity behind it is real. Every figure a sponsor sees here is
        built from verified, official results.
      </MarketingHero>

      <section className="grid gap-4 pb-8 sm:grid-cols-3">
        {[
          { icon: SealCheck, t: 'Verified activity', d: 'Impact is tied to results both teams confirmed. Unverified claims are excluded by design.' },
          { icon: ChartLineUp, t: 'Clear reporting', d: 'Support directed, supporters reached, official matches, verified rate. One honest dashboard.' },
          { icon: ShieldCheck, t: 'Evidence on file', d: 'Provenance for every finalized result sits behind the numbers, not hidden from view.' },
        ].map(({ icon: Icon, t, d }) => (
          <div key={t} className="rounded-[var(--radius-xl)] border border-border bg-surface-1 bezel-core p-5">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-3 text-[var(--brand-2)]"><Icon className="h-5 w-5" weight="bold" /></span>
            <h2 className="mt-3 text-base font-semibold text-text-strong">{t}</h2>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>

      <section className="pb-20 pt-8">
        <h2 className="font-display text-3xl font-semibold text-text-strong">Request the sponsor proof deck</h2>
        <p className="mb-6 mt-2 max-w-2xl text-muted">Tell us what impact you want to create. We will share the reporting model, example campaign story, and pilot package options.</p>
        <PublicInquiryForm type="sponsor" />
      </section>
    </MarketingShell>
  );
}
