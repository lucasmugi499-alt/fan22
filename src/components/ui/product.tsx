'use client';

import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { ArrowRight01Icon, CheckmarkCircle01Icon, Coins01Icon, Search01Icon, SecurityCheckIcon, SparklesIcon } from 'hugeicons-react';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getSportTheme, SportTheme, sports, trustStatements } from '@/lib/sportThemes';
import { SportType } from '@/types';
import { cn } from '@/lib/utils';

export function PageContainer({
  children,
  className,
  compact = false,
}: {
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('page-shell page-safe w-full', compact ? 'py-5 md:py-8' : 'py-7 md:py-12', className)}>
      {children}
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5 flex flex-col gap-3 md:mb-8 md:flex-row md:items-end md:justify-between', className)}>
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--goal-mint)]">
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-2xl font-black tracking-tight text-white md:text-4xl">
          {title}
        </h2>
        {description && <p className="mt-2 text-sm leading-6 text-slate-300 md:text-base">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function AppPageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-white/10 bg-white/[0.045] p-5 md:p-7', className)}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--goal-mint)]">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-3xl font-black tracking-tight text-white md:text-5xl">
            {title}
          </h1>
          {description && <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">{description}</p>}
          {meta && <div className="mt-4 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">{actions}</div>}
      </div>
    </section>
  );
}

export function DashboardHero({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('relative overflow-hidden rounded-xl border border-white/10 bg-[#0A0D14] p-5 md:p-7', className)}>
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(0,196,106,0.14),transparent_38%),linear-gradient(45deg,rgba(245,185,66,0.11),transparent_42%)]" />
      <div className="relative z-10">{children}</div>
    </section>
  );
}

export function DashboardSection({
  eyebrow,
  title,
  description,
  action,
  children,
  className,
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-4', className)}>
      {title && <SectionHeader eyebrow={eyebrow} title={title} description={description} action={action} className="mb-0" />}
      {children}
    </section>
  );
}

export function DashboardStatGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', className)}>{children}</section>;
}

export function ActionToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] p-3', className)}>
      {children}
    </div>
  );
}

export function StickyFilterBar({
  filters,
  active,
  onChange,
  className,
}: {
  filters: string[];
  active: string;
  onChange: (filter: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('sticky top-0 z-30 -mx-4 mb-5 border-y border-white/8 bg-[#05070A]/82 px-4 py-3 backdrop-blur-2xl md:-mx-0 md:rounded-xl md:border md:bg-white/5 lg:top-16', className)}>
      <div className="hide-scrollbar flex gap-2 overflow-x-auto">
        {filters.map((filter) => (
          <Button
            key={filter}
            variant={active === filter ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'shrink-0 rounded-lg text-xs',
              active !== filter && 'bg-white/5 text-slate-300'
            )}
            onClick={() => onChange(filter)}
          >
            {filter}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  onReset,
}: {
  title: string;
  description: string;
  onReset?: () => void;
}) {
  return (
    <div className="glass-panel flex min-h-[260px] flex-col items-center justify-center rounded-xl px-5 py-10 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-lg border border-white/10 bg-white/6 text-[var(--goal-mint)]">
        <Search01Icon className="size-6" />
      </div>
      <h3 className="font-display text-xl font-black text-white">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">{description}</p>
      {onReset && (
        <Button className="mt-5" onClick={onReset}>
          Reset Filter
        </Button>
      )}
    </div>
  );
}

export function SportBadge({
  sport,
  className,
  label,
}: {
  sport: SportType | string;
  className?: string;
  label?: string;
}) {
  const theme = getSportTheme(sport);
  const Icon = theme.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em]',
        'border-white/10 bg-white/7 text-white',
        className
      )}
      style={{ boxShadow: `inset 0 0 0 1px ${theme.color}22`, color: theme.color }}
    >
      <Icon className="size-3" />
      {label ?? theme.name}
    </span>
  );
}

export function SportTabs({
  active,
  onChange,
  includeAll = true,
}: {
  active: string;
  onChange: (sport: string) => void;
  includeAll?: boolean;
}) {
  const items = includeAll ? ['All', ...sports.map((sport) => sport.name)] : sports.map((sport) => sport.name);
  return <StickyFilterBar filters={items} active={active} onChange={onChange} />;
}

export function GoalPlacePointsBadge({
  points,
  className,
}: {
  points: number;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex items-center gap-2 rounded-lg border border-[var(--goal-gold)]/30 bg-[var(--goal-gold)]/12 px-3 py-2 text-[var(--goal-gold)]', className)}>
      <Coins01Icon className="size-4" />
      <span className="text-xs font-black uppercase tracking-[0.16em]">GoalPlace Points</span>
      <span className="font-display text-sm font-black text-white">{points.toLocaleString()}</span>
    </div>
  );
}

export function TrustNote({
  compact = false,
  items = trustStatements,
}: {
  compact?: boolean;
  items?: string[];
}) {
  return (
    <div className={cn('rounded-xl border border-[var(--goal-emerald)]/20 bg-[var(--goal-emerald)]/8 p-4', !compact && 'md:p-6')}>
      <div className="mb-3 flex items-center gap-2 text-[var(--goal-mint)]">
        <SecurityCheckIcon className="size-5" />
        <h3 className="font-display text-base font-black text-white">Trust Built In</h3>
      </div>
      <div className={cn('grid gap-2', compact ? 'text-xs' : 'md:grid-cols-2')}>
        {items.map((item) => (
          <div key={item} className="flex items-start gap-2 text-sm leading-5 text-slate-300">
            <CheckmarkCircle01Icon className="mt-0.5 size-4 shrink-0 text-[var(--goal-mint)]" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ImpactStatCard({
  label,
  value,
  detail,
  icon: Icon = SparklesIcon,
  tone = 'emerald',
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  tone?: 'emerald' | 'gold' | 'orange' | 'blue';
}) {
  const tones = {
    emerald: 'text-[var(--goal-mint)] border-[var(--goal-emerald)]/25 bg-[var(--goal-emerald)]/10',
    gold: 'text-[var(--goal-gold)] border-[var(--goal-gold)]/25 bg-[var(--goal-gold)]/10',
    orange: 'text-[var(--basketball)] border-orange-400/25 bg-orange-500/10',
    blue: 'text-[var(--rugby)] border-blue-400/25 bg-blue-500/10',
  };
  return (
    <div className="glass-panel rounded-xl p-4">
      <div className={cn('mb-4 flex size-10 items-center justify-center rounded-lg border', tones[tone])}>
        <Icon className="size-5" />
      </div>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 font-display text-2xl font-black text-white">{value}</p>
      {detail && <p className="mt-2 text-sm leading-5 text-slate-300">{detail}</p>}
    </div>
  );
}

export function StadiumGlow({ className }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div className="absolute inset-0 bg-[url('/placeholders/stadium-glow.svg')] bg-cover bg-center opacity-28 mix-blend-screen" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#05070A]/20 to-[#05070A]" />
    </div>
  );
}

export function BackgroundOrbs({ className }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(0,196,106,0.18),transparent_28%),radial-gradient(circle_at_82%_14%,rgba(245,185,66,0.12),transparent_24%),radial-gradient(circle_at_55%_80%,rgba(59,130,246,0.12),transparent_32%)]" />
    </div>
  );
}

export function AnimatedCounter({
  value,
  suffix = '',
}: {
  value: number;
  suffix?: string;
}) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.35 }}
    >
      {value.toLocaleString()}{suffix}
    </motion.span>
  );
}

function StoryVisual({ theme, title, detail }: { theme: SportTheme; title: string; detail: string }) {
  const Icon = theme.icon;
  return (
    <div className={cn('glass-panel relative overflow-hidden rounded-xl p-5', theme.edgeClass)}>
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-60', theme.mutedGradient)} />
      <div className="relative z-10">
        <div className="mb-8 flex items-center justify-between">
          <SportBadge sport={theme.name} />
          <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-white">
            <Icon className="size-5" />
          </div>
        </div>
        <h3 className="font-display text-3xl font-black text-white">{title}</h3>
        <p className="mt-3 text-sm leading-6 text-slate-200">{detail}</p>
        <div className="mt-8 grid grid-cols-2 gap-3">
          {theme.challengeExamples.slice(0, 2).map((challenge) => (
            <div key={challenge} className="rounded-lg border border-white/10 bg-black/24 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Example</p>
              <p className="mt-1 text-sm font-bold text-white">{challenge}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StickyStorySection() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [60, -60]);

  const steps = [
    {
      title: 'Discover local matches',
      detail: "Live fixtures, league context, venues, and today's best community moments surface fast.",
      theme: getSportTheme('Football'),
    },
    {
      title: 'Support verified athletes',
      detail: 'Fans back real athletes, teams, and verified performance challenges with clear impact.',
      theme: getSportTheme('Basketball'),
    },
    {
      title: 'Performance is confirmed',
      detail: 'League admins and officials confirm achievements before rewards are released.',
      theme: getSportTheme('Rugby'),
    },
    {
      title: 'Athletes get paid and communities rise',
      detail: 'Support becomes transport, meals, training, medical recovery, and recognition.',
      theme: getSportTheme('Football'),
    },
  ];

  return (
    <section ref={ref} className="relative hidden py-24 md:block">
      <SectionHeader
        eyebrow="The GoalPlace Engine"
        title="From local action to verified impact."
        description="A simple loop for fans, athletes, teams, leagues, and sponsors to build Ugandan sport together."
      />
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <motion.div style={{ y }} className="sticky top-28 h-fit">
          <div className="grid gap-4">
            {steps.slice(0, 2).map((step) => (
              <StoryVisual key={step.title} {...step} />
            ))}
          </div>
        </motion.div>
        <div className="space-y-8">
          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-120px' }}
              transition={{ duration: 0.45 }}
              className="glass-panel rounded-xl p-6"
            >
              <div className="mb-5 flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-white/8 font-display text-sm font-black text-[var(--goal-mint)]">
                  {index + 1}
                </span>
                <SportBadge sport={step.theme.name} />
              </div>
              <h3 className="font-display text-2xl font-black text-white">{step.title}</h3>
              <p className="mt-3 text-base leading-7 text-slate-300">{step.detail}</p>
              <Button variant="ghost" size="sm" className="mt-4">
                See the flow <ArrowRight01Icon className="size-4" />
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DataCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-white/10 bg-white/5 p-4 md:p-5 transition-colors hover:border-white/15', className)}>
      {children}
    </div>
  );
}

export function DataTableCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-white/10 bg-white/5 overflow-hidden', className)}>
      <div className="overflow-x-auto hide-scrollbar">
        {children}
      </div>
    </div>
  );
}

export const TableCard = DataTableCard;

export function MobileDataCard({
  title,
  eyebrow,
  meta,
  children,
  actions,
  className,
}: {
  title: string;
  eyebrow?: string;
  meta?: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <article className={cn('rounded-xl border border-white/10 bg-white/[0.045] p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>}
          <h3 className="mt-1 font-display text-lg font-black text-white">{title}</h3>
        </div>
        {meta}
      </div>
      {children && <div className="mt-4 space-y-3 text-sm text-slate-300">{children}</div>}
      {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
    </article>
  );
}

export function StatusBadge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'gold';
  className?: string;
}) {
  const tones = {
    neutral: 'border-white/10 bg-white/7 text-slate-200',
    success: 'border-[var(--goal-emerald)]/30 bg-[var(--goal-emerald)]/12 text-[var(--goal-mint)]',
    warning: 'border-orange-400/30 bg-orange-500/12 text-orange-300',
    danger: 'border-red-400/30 bg-red-500/12 text-red-300',
    info: 'border-blue-400/30 bg-blue-500/12 text-blue-300',
    gold: 'border-[var(--goal-gold)]/30 bg-[var(--goal-gold)]/12 text-[var(--goal-gold)]',
  };

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]', tones[tone], className)}>
      {children}
    </span>
  );
}

export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#0B1117]/96 p-0 text-white shadow-2xl backdrop-blur-2xl sm:max-w-xl max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:rounded-b-none">
        <div className="max-h-[82dvh] overflow-y-auto p-5">
          <DialogHeader className="mb-5 pr-8">
            <DialogTitle className="font-display text-2xl font-black">{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TabStrip({
  tabs,
  activeTab,
  onTabChange,
  groups,
}: {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  groups?: { label: string; tabs: string[] }[];
}) {
  const groupedTabs = groups?.length ? groups : [{ label: '', tabs }];

  return (
    <div className="mx-auto mt-6 max-w-7xl pb-2">
      <div className="hide-scrollbar flex snap-x gap-3 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.035] p-2">
        {groupedTabs.map((group) => (
          <div key={group.label || 'tabs'} className="flex shrink-0 snap-start items-center gap-1 rounded-lg bg-black/10 p-1">
            {group.label && (
              <span className="hidden px-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 md:inline">
                {group.label}
              </span>
            )}
            {group.tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                className={cn(
                  'whitespace-nowrap rounded-lg px-3 py-2 text-xs font-black transition-colors sm:px-4',
                  activeTab === tab
                    ? 'bg-[var(--goal-emerald)] text-[#031008] shadow-[0_10px_26px_rgba(0,196,106,0.22)]'
                    : 'text-slate-300 hover:bg-white/8 hover:text-white'
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export const AdminTabBar = TabStrip;
