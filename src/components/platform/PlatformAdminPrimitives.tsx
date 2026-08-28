'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, MagnifyingGlass } from '@phosphor-icons/react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ScrollRail } from '@/components/ui/ScrollRail';
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
    <header className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">{eyebrow}</p>
        {/*
          Deliberately smaller on a phone. At the previous size the title and its description
          filled most of a 390px viewport, so an operator arrived at a headline instead of at
          the work. The console is used one-handed on a touchline; the first case card should
          be reachable without a scroll.
        */}
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-strong sm:text-3xl md:mt-2 md:text-4xl">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted md:mt-2">{description}</p>
      </div>
      {action}
    </header>
  );
}

export function PlatformStatGrid({ items }: { items: Array<{ label: string; value: string | number; tone?: 'default' | 'good' | 'warn' | 'bad' }> }) {
  return (
    <ScrollRail className="-mx-[var(--gutter)] px-[var(--gutter)] md:mx-0 md:overflow-visible md:px-0">
      <div className="flex gap-2.5 md:grid md:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <Card key={item.label} className={cn(
            'min-w-[10.5rem] flex-1 p-3.5 md:min-w-0',
            item.tone === 'good' && 'border-brand/30 bg-brand-subtle/25',
            item.tone === 'warn' && 'border-[color-mix(in_srgb,var(--state-pending),transparent_55%)]',
            item.tone === 'bad' && 'border-[color-mix(in_srgb,var(--state-error),transparent_55%)]',
          )}>
            <p data-numeric className="text-2xl font-bold tabular-nums text-text-strong">{item.value}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">{item.label}</p>
          </Card>
        ))}
      </div>
    </ScrollRail>
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
        <p className="break-words text-sm font-semibold text-text-strong sm:truncate">{title}</p>
        <p className="mt-1 break-words text-xs leading-5 text-muted sm:truncate">{meta}</p>
        {detail ? <div className="mt-2">{detail}</div> : null}
      </div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
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

/**
 * The console's table.
 *
 * Directory rows were the right primitive when every admin surface was a read-only list, but
 * an operating console compares objects — which league has no clubs, which athlete cannot be
 * paid — and comparison wants columns. Rows carry actions rather than links, because the
 * work here is running a command, not navigating away.
 *
 * The table scrolls inside its own rail rather than widening the page: on a phone a wide
 * admin table would otherwise push the whole layout sideways, and the fade edges say the
 * columns continue instead of leaving them looking cut off.
 */
export type PlatformColumn<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  /** Columns that earn their place on a phone. Everything else hides below `sm`. */
  primary?: boolean;
  align?: 'start' | 'end';
};

export function PlatformTable<T>({
  columns,
  rows,
  getKey,
  empty,
}: {
  columns: PlatformColumn<T>[];
  rows: T[];
  getKey: (row: T) => string;
  empty: ReactNode;
}) {
  if (!rows.length) return <>{empty}</>;

  return (
    <ScrollRail wrapperClassName="rounded-[var(--radius-md)] border border-border">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            {columns.map((column) => (
              <th
                key={column.header}
                scope="col"
                className={cn(
                  'px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-subtle',
                  column.align === 'end' ? 'text-right' : 'text-left',
                  !column.primary && 'hidden sm:table-cell',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getKey(row)} className="border-b border-border last:border-b-0 hover:bg-surface-2">
              {columns.map((column) => (
                <td
                  key={column.header}
                  className={cn(
                    'px-3 py-2.5 align-middle text-text-strong',
                    column.align === 'end' ? 'text-right' : 'text-left',
                    !column.primary && 'hidden sm:table-cell',
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRail>
  );
}

/** The action cluster on a table row or a page header. */
export function CommandButton({
  label,
  onClick,
  tone = 'default',
  disabled,
}: {
  label: string;
  onClick: () => void;
  tone?: 'default' | 'primary' | 'destructive';
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      size="sm"
      variant={tone === 'primary' ? 'primary' : tone === 'destructive' ? 'commandGoverned' : 'command'}
      className="shrink-0 rounded-[var(--radius-sm)] px-2.5 text-xs"
    >
      {label}
    </Button>
  );
}
