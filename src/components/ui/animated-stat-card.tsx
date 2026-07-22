'use client';

import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { cn } from '@/lib/utils';
import { GlassCard } from './glass-card';
import type { IconComponent } from '@/lib/icons';

export function AnimatedStatCard({
  title,
  value,
  prefix = '',
  suffix = '',
  icon: Icon,
  trend,
  className,
}: {
  title: string;
  /** Numbers count up on scroll. Pass a string for qualitative statuses ("Verified",
   *  "Healthy") so they render as-is rather than being forced into a fake number. */
  value: number | string;
  prefix?: string;
  suffix?: string;
  icon?: IconComponent;
  trend?: { value: number; label: string; positive: boolean };
  className?: string;
}) {
  const [inView, setInView] = useState(false);
  const reduceMotion = useReducedMotion();
  const springValue = useSpring(0, { bounce: 0, duration: 2000 });
  const displayValue = useTransform(springValue, (current) => Math.round(current).toLocaleString());
  const isNumeric = typeof value === 'number';

  useEffect(() => {
    if (inView && isNumeric) {
      springValue.set(value);
    }
  }, [inView, value, isNumeric, springValue]);

  return (
    <motion.div
      onViewportEnter={() => setInView(true)}
      viewport={{ once: true }}
    >
      <GlassCard className={cn("p-5 flex flex-col gap-3 group", className)}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-400 group-hover:text-slate-300 transition-colors">{title}</span>
          {Icon && (
            <div className="size-8 rounded-full bg-[var(--goal-emerald)]/10 flex items-center justify-center text-[var(--goal-emerald)] shadow-[0_0_15px_rgba(0,196,106,0.15)]">
              <Icon className="size-4" />
            </div>
          )}
        </div>
        <div className="flex items-baseline gap-1 mt-1">
          {prefix && <span className="text-2xl font-black text-white">{prefix}</span>}
          {/* The count-up only renders once it has actually started. Otherwise the real
              figure is shown — server-rendered HTML, a failed hydration, a throttled
              rAF, or reduced motion must never leave a stat resting at 0. */}
          {isNumeric && !reduceMotion && inView ? (
            <motion.span className="text-3xl lg:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-white/60 tracking-tight">
              {displayValue}
            </motion.span>
          ) : (
            <span
              className={cn(
                'font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-white/60 tracking-tight',
                isNumeric ? 'text-3xl lg:text-4xl' : 'text-2xl lg:text-3xl'
              )}
            >
              {isNumeric ? value.toLocaleString() : value}
            </span>
          )}
          {suffix && <span className="text-xl font-bold text-white/70">{suffix}</span>}
        </div>
        {trend && (
          <div className="flex items-center gap-2 mt-auto pt-2 text-xs">
            <span className={cn(
              "font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5",
              trend.positive 
                ? "bg-[var(--goal-emerald)]/15 text-[var(--goal-mint)]" 
                : "bg-red-500/15 text-red-400"
            )}>
              {trend.positive ? '+' : '-'}{Math.abs(trend.value)}%
            </span>
            <span className="text-slate-500 font-medium">{trend.label}</span>
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}
