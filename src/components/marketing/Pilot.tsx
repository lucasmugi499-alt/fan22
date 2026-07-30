import { MapPin, ShieldCheck, Users } from '@phosphor-icons/react/dist/ssr';
import { MarketingShell, MarketingHero } from '@/components/marketing/MarketingShell';
import { PublicInquiryForm } from '@/components/marketing/PublicInquiryForm';

export function Pilot() {
  return (
    <MarketingShell>
      <MarketingHero eyebrow="Uganda pilot" title={<>Starting where the game is <span className="text-brand">already alive.</span></>}>
        Grassroots football, basketball and rugby leagues across Uganda are the first to run on a
        verified record.
      </MarketingHero>

      <section className="grid gap-4 pb-8 sm:grid-cols-3">
        {[
          { icon: MapPin, t: 'Local first', d: 'Built for the leagues, teams and athletes playing every weekend, not an imported template.' },
          { icon: ShieldCheck, t: 'Trust first', d: 'A confirmed, finalized result is the unit of value. Everything else follows from it.' },
          { icon: Users, t: 'Mobile first', d: 'Designed for mid-range Android on real connections. Fast, legible, no clutter.' },
        ].map(({ icon: Icon, t, d }) => (
          <div key={t} className="rounded-[var(--radius-xl)] border border-border bg-surface-1 bezel-core p-5">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-subtle text-brand"><Icon className="h-5 w-5" weight="bold" /></span>
            <h2 className="mt-3 text-base font-semibold text-text-strong">{t}</h2>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>

      <section className="pb-20 pt-8">
        <h2 className="font-display text-3xl font-semibold text-text-strong">Bring your league into the pilot</h2>
        <p className="mb-6 mt-2 max-w-2xl text-muted">Share the league structure and the operational problem you most need solved. This request does not create an administrator account.</p>
        <PublicInquiryForm type="league_pilot" />
      </section>
    </MarketingShell>
  );
}
