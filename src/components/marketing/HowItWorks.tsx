import { PaperPlaneTilt, SealCheck, ShieldCheck, Warning } from '@phosphor-icons/react/dist/ssr';
import { MarketingShell, MarketingHero } from '@/components/marketing/MarketingShell';

const CHAIN = [
  { icon: PaperPlaneTilt, t: 'A team submits the result', d: 'The submitting team enters the score. It is recorded as a claim, marked pending, and it moves nothing yet.', tone: 'text-muted', bg: 'bg-surface-3' },
  { icon: SealCheck, t: 'The opponent confirms', d: 'The opposing team has 72 hours to confirm or dispute. The team that reported a result can never be the one that confirms it.', tone: 'text-[var(--state-pending)]', bg: 'bg-[var(--state-pending-bg)]' },
  { icon: Warning, t: 'Disputes go to the league', d: 'If the teams disagree, the league adjudicates. Silence past the deadline escalates too. Silence is never treated as agreement.', tone: 'text-[var(--state-disputed)]', bg: 'bg-[var(--state-disputed-bg)]' },
  { icon: ShieldCheck, t: 'The server finalizes it', d: 'Only a trusted server-side finalizer can make a result official. No app, team or league can write official directly. That is what makes standings trustworthy.', tone: 'text-[var(--state-verified)]', bg: 'bg-[var(--state-verified-bg)]' },
];

export function HowItWorks() {
  return (
    <MarketingShell>
      <MarketingHero eyebrow="How it works" title={<>From a claim to an <span className="text-brand">official result.</span></>}>
        Every result travels the same path. That path is the product.
      </MarketingHero>

      <section className="pb-20">
        <ol className="space-y-4">
          {CHAIN.map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={i} className="flex gap-4 rounded-[var(--radius-xl)] border border-border bg-surface-1 bezel-core p-5">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-lg)] ${step.bg} ${step.tone}`}>
                  <Icon className="h-6 w-6" weight="bold" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-text-strong">{step.t}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{step.d}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </MarketingShell>
  );
}
