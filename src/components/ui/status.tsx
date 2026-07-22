'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { StateDescriptor, TONE_CLASS } from '@/lib/statusSystem';
import { ArrowRight01Icon, Cancel01Icon } from 'hugeicons-react';

/**
 * Status presentation. Every badge carries an icon and a label as well as a colour, so the
 * state survives greyscale, low contrast and colour-blindness.
 */

export function StatusPill({
  state,
  size = 'default',
  className,
}: {
  state: StateDescriptor;
  size?: 'sm' | 'default';
  className?: string;
}) {
  const Icon = state.icon;
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 rounded-full border font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        TONE_CLASS[state.tone],
        className
      )}
      // The label is already visible text; the explanation is the useful part for AT.
      title={state.explanation}
    >
      <Icon className={cn('shrink-0', size === 'sm' ? 'size-3' : 'size-3.5')} />
      <span className="truncate">{state.label}</span>
      {state.tone === 'live' && (
        <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--state-live)] motion-reduce:animate-none" />
      )}
    </span>
  );
}

/**
 * "Verified by GoalPlace256" — the reusable trust component.
 *
 * Tapping it opens the provenance sheet. A verification claim the user cannot interrogate
 * is just a graphic; being able to ask "why is this trusted?" is what makes it a claim.
 */
export function VerificationBadge({
  state,
  timestamp,
  source,
  method,
  onOpenHistory,
  className,
}: {
  state: StateDescriptor;
  timestamp?: string;
  source?: string;
  method?: string;
  onOpenHistory?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const Icon = state.icon;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'group inline-flex min-h-[var(--tap-min)] items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors',
          TONE_CLASS[state.tone],
          'hover:brightness-110',
          className
        )}
        aria-label={`${state.label}. ${state.explanation} Open verification details.`}
      >
        <Icon className="size-4 shrink-0" />
        <span className="min-w-0">
          <span className="block text-xs font-bold leading-tight">{state.label}</span>
          {timestamp && (
            <span className="block text-[11px] font-medium leading-tight opacity-70">{timestamp}</span>
          )}
        </span>
        <ArrowRight01Icon className="size-3.5 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5" />
      </button>

      <VerificationSheet
        open={open}
        onClose={() => setOpen(false)}
        state={state}
        timestamp={timestamp}
        source={source}
        method={method}
        onOpenHistory={onOpenHistory}
      />
    </>
  );
}

/**
 * Bottom sheet on mobile, centred panel on desktop. Explains why a record is trusted —
 * what state it is in, where it came from, and how it got there.
 */
export function VerificationSheet({
  open,
  onClose,
  state,
  timestamp,
  source,
  method,
  onOpenHistory,
}: {
  open: boolean;
  onClose: () => void;
  state: StateDescriptor;
  timestamp?: string;
  source?: string;
  method?: string;
  onOpenHistory?: () => void;
}) {
  const Icon = state.icon;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Verification details"
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.6 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85svh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-[var(--bg-elevated)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[26rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 sm:hidden" />

            <div className="flex items-start justify-between gap-3">
              <div className={cn('flex size-11 items-center justify-center rounded-xl border', TONE_CLASS[state.tone])}>
                <Icon className="size-5" />
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex size-11 items-center justify-center rounded-lg text-[var(--text-3)] transition-colors hover:bg-white/5 hover:text-white"
              >
                <Cancel01Icon className="size-5" />
              </button>
            </div>

            <h2 className="mt-3 font-display text-xl font-black text-white">{state.label}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-2)]">{state.explanation}</p>

            <dl className="mt-5 space-y-px overflow-hidden rounded-xl border border-white/10">
              <ProvenanceRow label="Responsibility" value={state.owner} />
              {source && <ProvenanceRow label="Source" value={source} />}
              {method && <ProvenanceRow label="Method" value={method} />}
              {timestamp && <ProvenanceRow label="Last updated" value={timestamp} />}
            </dl>

            {onOpenHistory && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenHistory();
                }}
                className="mt-4 flex min-h-[var(--tap-min)] w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-[var(--surface-interactive)] px-4 text-sm font-bold text-white transition-colors hover:bg-[var(--surface-interactive-hover)]"
              >
                Open audit trail
                <ArrowRight01Icon className="size-4" />
              </button>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ProvenanceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 bg-[var(--surface-interactive)] px-3 py-2.5">
      <dt className="shrink-0 text-xs font-medium text-[var(--text-3)]">{label}</dt>
      <dd className="min-w-0 truncate text-right text-xs font-bold text-[var(--text-1)]">{value}</dd>
    </div>
  );
}
