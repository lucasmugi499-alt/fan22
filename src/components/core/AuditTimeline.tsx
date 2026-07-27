import type { IconComponent } from '@/lib/icons';
import { cn } from '@/lib/utils';

export interface AuditStep {
  label: string;
  actor: string;
  timestamp?: string;
  note?: string;
  icon: IconComponent;
  tone?: 'brand' | 'verified' | 'pending' | 'disputed' | 'neutral';
}

const TONE: Record<NonNullable<AuditStep['tone']>, string> = {
  brand: 'border-[color:var(--brand)] text-brand bg-brand-subtle',
  verified: 'border-[color:var(--state-verified)] text-[var(--state-verified)] bg-[var(--state-verified-bg)]',
  pending: 'border-[color:var(--state-pending)] text-[var(--state-pending)] bg-[var(--state-pending-bg)]',
  disputed: 'border-[color:var(--state-disputed)] text-[var(--state-disputed)] bg-[var(--state-disputed-bg)]',
  neutral: 'border-border-strong text-muted bg-surface-3',
};

/**
 * Provenance as a vertical timeline: who did what, when. This is the audit trail that
 * answers "why is this verified?" and it lives behind a drawer, never on the main
 * dashboard.
 */
export function AuditTimeline({ steps }: { steps: AuditStep[] }) {
  return (
    <ol className="relative space-y-4">
      {steps.map((step, i) => {
        const Icon = step.icon;
        const last = i === steps.length - 1;
        return (
          <li key={i} className="relative flex gap-3 pb-1">
            {!last ? (
              <span className="absolute left-[15px] top-8 h-[calc(100%-12px)] w-px bg-border" aria-hidden />
            ) : null}
            <span className={cn('z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border', TONE[step.tone ?? 'neutral'])}>
              <Icon className="h-4 w-4" weight="bold" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-medium text-text-strong">{step.label}</p>
              <p className="text-xs text-muted">
                {step.actor}
                {step.timestamp ? <span className="text-subtle"> · {step.timestamp}</span> : null}
              </p>
              {step.note ? <p className="mt-1 text-xs leading-5 text-subtle">{step.note}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
