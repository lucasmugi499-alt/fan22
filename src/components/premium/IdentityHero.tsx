import { SealCheck } from '@phosphor-icons/react';

const SPORT_GRAD: Record<string, string> = {
  football: 'var(--grad-football)',
  basketball: 'var(--grad-basketball)',
  rugby: 'var(--grad-rugby)',
};

export function sportGradient(sport?: string): string {
  return SPORT_GRAD[String(sport ?? '').toLowerCase()] ?? 'var(--grad-pitch)';
}

/**
 * The colour-saturated identity card that fronts a club or athlete page, the way a broadcast
 * product introduces a team or a player: a bold coloured field, a crest or player cutout, a
 * big name, a follow control, and an oversized crest watermark bleeding off the corner.
 */
export function IdentityHero({
  media,
  watermark,
  eyebrow,
  title,
  meta,
  verified = false,
  gradient,
  action,
}: {
  media: React.ReactNode;
  watermark?: React.ReactNode;
  eyebrow?: string;
  title: string;
  meta?: React.ReactNode;
  verified?: boolean;
  gradient: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="sheen relative overflow-hidden rounded-[var(--radius-xl)] shadow-e2"
      style={{ backgroundImage: gradient }}
    >
      {watermark ? <div className="watermark text-[220px] leading-none">{watermark}</div> : null}

      {action ? <div className="absolute right-4 top-4 z-10">{action}</div> : null}

      <div className="relative flex items-end gap-4 p-5">
        <div className="shrink-0">{media}</div>
        <div className="min-w-0 flex-1 pb-1">
          {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">{eyebrow}</p> : null}
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl font-bold leading-none tracking-tight text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.3)] md:text-4xl">
              {title}
            </h1>
            {verified ? <SealCheck className="h-6 w-6 shrink-0 text-white" weight="fill" /> : null}
          </div>
          {meta ? <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-white/90">{meta}</div> : null}
        </div>
      </div>
    </div>
  );
}
