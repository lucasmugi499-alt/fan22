import Link from 'next/link';
import { ArrowRight, SealCheck, ShieldCheck, Users, Broadcast, ChartLineUp } from '@phosphor-icons/react/dist/ssr';
import { MarketingShell } from '@/components/marketing/MarketingShell';

const STEPS = [
  { t: 'Claimed', d: 'A team reports the score. It is a claim, visibly pending, counting toward nothing.' },
  { t: 'Confirmed', d: 'The opponent confirms or disputes within 72 hours. Silence is never consent.' },
  { t: 'Official', d: 'Only a trusted server finalizes it. Standings and stats move for official results only.' },
];

const AUDIENCES = [
  { icon: Broadcast, t: 'Fans', d: 'A premium local-sports app.' },
  { icon: SealCheck, t: 'Athletes', d: 'A verified career portfolio.' },
  { icon: Users, t: 'Teams', d: 'A focused operations console.' },
  { icon: ShieldCheck, t: 'Leagues', d: 'An operating desk with an exception queue.' },
  { icon: ChartLineUp, t: 'Sponsors', d: 'Impact and proof, built on verified activity.' },
];

export function Landing() {
  return (
    <MarketingShell>
      <section className="py-14 md:py-24">
        <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[color:var(--border-glow)] bg-brand-subtle px-3 py-1 text-xs font-medium text-brand">
          <SealCheck className="h-3.5 w-3.5" weight="fill" /> Verified grassroots sport, Uganda
        </span>
        <h1 className="mt-5 max-w-4xl font-display text-4xl font-semibold leading-[1.03] tracking-tight text-text-strong md:text-7xl">
          A result isn&apos;t official until <span className="text-brand">both teams agree.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base text-muted md:text-lg">
          GoalPlace256 is the operating system for grassroots leagues. Teams report scores,
          opponents confirm them, and only then does a result count. Verification creates trust.
          Trust creates value.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login" className="group inline-flex h-12 items-center gap-2 rounded-[var(--radius-pill)] bg-brand pl-6 pr-2 text-sm font-semibold text-on-brand shadow-[var(--glow-brand)]">
            Enter the platform
            <span className="grid h-8 w-8 place-items-center rounded-full bg-black/15 transition-transform duration-[var(--dur-micro)] ease-[var(--ease-fluid)] group-hover:translate-x-0.5">
              <ArrowRight className="h-4 w-4" weight="bold" />
            </span>
          </Link>
          <Link href="/how-it-works" className="inline-flex h-12 items-center rounded-[var(--radius-pill)] border border-border-strong bg-surface-2 px-6 text-sm font-medium text-text-strong hover:bg-surface-3">
            How verification works
          </Link>
        </div>
      </section>

      <section className="grid gap-4 pb-16 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <div key={step.t} className="rounded-[var(--radius-xl)] border border-border bg-surface-1 bezel-core p-5">
            <span className="inline-grid h-8 w-8 place-items-center rounded-full bg-brand-subtle text-sm font-bold text-brand">{i + 1}</span>
            <h2 className="mt-3 flex items-center gap-2 text-base font-semibold text-text-strong">
              {i === 2 ? <ShieldCheck className="h-4 w-4 text-[var(--state-verified)]" weight="fill" /> : null}
              {step.t}
            </h2>
            <p className="mt-1 text-sm text-muted">{step.d}</p>
          </div>
        ))}
      </section>

      <section className="pb-20">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-text-strong md:text-3xl">One brand, six audiences.</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AUDIENCES.map(({ icon: Icon, t, d }) => (
            <div key={t} className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-3 text-brand"><Icon className="h-5 w-5" weight="bold" /></span>
              <div>
                <h3 className="text-sm font-semibold text-text-strong">{t}</h3>
                <p className="text-sm text-muted">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
