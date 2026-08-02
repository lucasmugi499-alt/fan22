'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, MagnifyingGlass } from '@phosphor-icons/react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

export function PlatformAdminHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-strong md:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
      </div>
      {action}
    </header>
  );
}

export function PlatformStatGrid({ items }: { items: Array<{ label: string; value: string | number; tone?: 'default' | 'good' | 'warn' | 'bad' }> }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className={cn(
          'p-3.5',
          item.tone === 'good' && 'border-brand/30 bg-brand-subtle/25',
          item.tone === 'warn' && 'border-[color-mix(in_srgb,var(--state-pending),transparent_55%)]',
          item.tone === 'bad' && 'border-[color-mix(in_srgb,var(--state-error),transparent_55%)]',
        )}>
          <p data-numeric className="text-2xl font-bold tabular-nums text-text-strong">{item.value}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">{item.label}</p>
        </Card>
      ))}
    </div>
  );
}

export function PlatformSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{placeholder}</span>
      <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 pl-9 pr-3 text-sm text-text-strong outline-none placeholder:text-subtle focus:border-brand"
      />
    </label>
  );
}

export function StatusChip({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  return (
    <span className={cn(
      'inline-flex min-h-7 shrink-0 items-center rounded-[var(--radius-sm)] border px-2.5 py-1 text-[11px] font-semibold capitalize',
      tone === 'good' && 'border-brand/35 bg-brand-subtle/30 text-brand',
      tone === 'warn' && 'border-[color-mix(in_srgb,var(--state-pending),transparent_45%)] bg-[color-mix(in_srgb,var(--state-pending),transparent_88%)] text-[var(--state-pending)]',
      tone === 'bad' && 'border-[color-mix(in_srgb,var(--state-error),transparent_45%)] bg-[color-mix(in_srgb,var(--state-error),transparent_88%)] text-[var(--state-error)]',
      tone === 'neutral' && 'border-border bg-surface-3 text-muted',
    )}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}

export function DirectoryRow({
  href,
  title,
  meta,
  status,
  statusTone,
  detail,
}: {
  href?: string;
  title: string;
  meta: string;
  status?: string;
  statusTone?: 'good' | 'warn' | 'bad' | 'neutral';
  detail?: ReactNode;
}) {
  const content = (
    <>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-text-strong">{title}</p>
        <p className="mt-1 truncate text-xs text-muted">{meta}</p>
        {detail ? <div className="mt-2">{detail}</div> : null}
      </div>
      <div className="flex items-center gap-2">
        {status ? <StatusChip label={status} tone={statusTone} /> : null}
        {href ? <ArrowRight className="h-4 w-4 text-subtle" weight="bold" /> : null}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="grid gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 transition hover:border-brand/40 hover:bg-surface-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        {content}
      </Link>
    );
  }

  return (
    <div className="grid gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      {content}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold text-text-strong">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted">{children}</p>
    </Card>
  );
}
