import { cn } from '@/lib/utils';

const GRAD: Record<string, string> = {
  brand: 'var(--grad-brand)',
  gold: 'var(--grad-gold)',
  broadcast: 'var(--grad-broadcast)',
  pitch: 'var(--grad-pitch)',
};

/**
 * A full-bleed diagonal gradient section header, the way broadcast sports products announce
 * a page. Bright, confident, with a diagonal light sheen. This is the single biggest signal
 * that a screen is premium rather than a plain dark dashboard.
 */
export function GradientBanner({
  title,
  subtitle,
  variant = 'brand',
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  variant?: keyof typeof GRAD;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'sheen relative -mx-[var(--gutter)] overflow-hidden md:mx-0 md:rounded-[var(--radius-xl)]',
        className
      )}
      style={{ backgroundImage: GRAD[variant] }}
    >
      <div className="relative px-[var(--gutter)] py-7 md:px-8 md:py-9">
        <h1 className="font-display text-3xl font-bold tracking-tight text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.25)] md:text-5xl">
          {title}
        </h1>
        {subtitle ? <p className="mt-1.5 max-w-xl text-sm text-white/90 md:text-base">{subtitle}</p> : null}
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    </div>
  );
}
