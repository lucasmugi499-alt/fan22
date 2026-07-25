import { MarketingShell, MarketingHero } from '@/components/marketing/MarketingShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { STATE } from '@/lib/statusSystem';

const STATES = [
  STATE.awaiting_confirmation,
  STATE.overdue,
  STATE.disputed,
  STATE.official,
  STATE.rejected,
];

export function Verification() {
  return (
    <MarketingShell>
      <MarketingHero eyebrow="Verification" title={<>Every state means <span className="text-brand">exactly one thing.</span></>}>
        Trust is only useful if it is legible. A pending result never looks official, and status is
        never shown by colour alone.
      </MarketingHero>

      <section className="pb-20">
        <div className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface-1 bezel-core">
          {STATES.map((s) => (
            <div key={s.id} className="flex items-start gap-4 border-b border-border p-5 last:border-0">
              <div className="shrink-0"><StatusBadge state={s} /></div>
              <div>
                <p className="text-sm font-medium text-text-strong">{s.explanation}</p>
                <p className="mt-0.5 text-xs text-subtle">Owner: {s.owner}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
