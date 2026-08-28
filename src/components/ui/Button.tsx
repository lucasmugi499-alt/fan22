'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { IconComponent } from '@/lib/icons';

/**
 * The one button. Variants encode hierarchy (exactly one `primary` per view). Fluid spring
 * motion and a tactile press; a trailing icon rides in its own nested circle (the
 * "button-in-button") so it reads as a deliberate control, not a glyph stuck to the label.
 */
const button = cva(
  'group relative inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] font-semibold ' +
    'transition-[background,color,box-shadow,transform,border-color] duration-[var(--dur-micro)] ease-[var(--ease-fluid)] ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ' +
    'disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none whitespace-nowrap',
  {
    variants: {
      variant: {
        primary:
          'bg-brand text-on-brand shadow-[var(--glow-brand)] hover:bg-[var(--brand-hover)]',
        secondary:
          'bg-surface-2 text-text-strong border border-border-strong bezel-core hover:bg-surface-3 hover:border-[var(--border-strong)]',
        subtle: 'bg-brand-subtle text-brand hover:bg-[color-mix(in_srgb,var(--brand-subtle),var(--brand)_10%)]',
        ghost: 'text-muted hover:bg-surface-glass hover:text-text-strong',
        danger: 'bg-[var(--state-error)] text-white shadow-e1 hover:opacity-90',
        command:
          'border border-border-strong bg-surface-2 text-text-strong bezel-core hover:border-brand/45 hover:bg-surface-3',
        commandConsequential:
          'border border-[color-mix(in_srgb,var(--state-warning),transparent_45%)] bg-[var(--state-warning-bg)] text-[var(--state-warning)] hover:border-[var(--state-warning)]',
        commandGoverned:
          'border border-[color-mix(in_srgb,var(--state-error),transparent_40%)] bg-[var(--state-error-bg)] text-[var(--state-error)] hover:border-[var(--state-error)]',
        quiet: 'text-subtle hover:bg-surface-glass hover:text-text-strong',
      },
      size: {
        sm: 'min-h-11 px-4 text-sm md:min-h-9',
        md: 'h-11 px-5 text-[15px]',
        lg: 'h-12 px-6 text-base',
        icon: 'h-11 w-11 tap px-0',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  icon?: IconComponent;
  iconTrailing?: IconComponent;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, icon: Icon, iconTrailing: Trailing, children, ...props },
  ref
) {
  return (
    <button ref={ref} className={cn(button({ variant, size, block }), Trailing && 'pr-1.5', className)} {...props}>
      {Icon ? <Icon className="h-[1.15em] w-[1.15em] shrink-0" weight="bold" /> : null}
      {children}
      {Trailing ? (
        <span className="ml-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-black/15 transition-transform duration-[var(--dur-micro)] ease-[var(--ease-fluid)] group-hover:translate-x-0.5 group-hover:-translate-y-px">
          <Trailing className="h-4 w-4" weight="bold" />
        </span>
      ) : null}
    </button>
  );
});
