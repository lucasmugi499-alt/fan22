'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { CheckmarkCircle01Icon, Alert02Icon, Clock01Icon } from 'hugeicons-react';
import type { ResultSubmissionStatus } from '@/types';

/**
 * The result lifecycle, shown as a path rather than a status word.
 *
 * A team admin's real question is never "what status is this?" but "what happens next, and
 * is it my turn?". A step indicator answers both at a glance, and makes the two-sided
 * confirmation model visible — which is the point of the workflow.
 */

export type TimelineStepState = 'done' | 'current' | 'upcoming' | 'problem';

export type TimelineStep = {
  label: string;
  state: TimelineStepState;
  /** Shown under the current step: what the viewer should do, or who is holding it up. */
  hint?: string;
};

const HAPPY_PATH = [
  'Fixture scheduled',
  'Match completed',
  'Result submitted',
  'Opponent confirmation',
  'Official result',
] as const;

const DISPUTED_PATH = ['Result submitted', 'Disputed', 'League review', 'Final decision'] as const;

/**
 * Derives the step list from a submission status. Returns the disputed path when the
 * result has gone into contention, because the happy path stops describing reality.
 */
export function stepsForSubmission(
  status: ResultSubmissionStatus | null,
  matchPlayed: boolean
): TimelineStep[] {
  if (status === 'disputed' || status === 'rejected') {
    const idx = status === 'disputed' ? 2 : 3;
    return DISPUTED_PATH.map((label, i) => ({
      label,
      state: i < idx ? 'done' : i === idx ? 'problem' : 'upcoming',
      hint: i === idx ? 'The league is reviewing both submissions.' : undefined,
    }));
  }

  const reached = !status
    ? matchPlayed
      ? 2
      : 1
    : status === 'pending_confirmation' || status === 'confirmation_overdue'
      ? 3
      : status === 'confirmed'
        ? 4
        : status === 'official'
          ? 5
          : 2;

  return HAPPY_PATH.map((label, i) => {
    const position = i + 1;
    const state: TimelineStepState =
      position < reached ? 'done' : position === reached ? 'current' : 'upcoming';
    let hint: string | undefined;
    if (position === reached) {
      if (!status && matchPlayed) hint = 'Submit the final result to start confirmation.';
      else if (status === 'pending_confirmation') hint = 'Waiting on the opposing team admin.';
      else if (status === 'confirmation_overdue') hint = 'No response in 72 hours — escalated to the league.';
      else if (status === 'confirmed') hint = 'Being finalised into the official record.';
    }
    return { label, state, hint };
  });
}

export function MatchTimeline({ steps, className }: { steps: TimelineStep[]; className?: string }) {
  const current = steps.find((s) => s.state === 'current' || s.state === 'problem');

  return (
    <div className={cn('min-w-0', className)}>
      <ol className="flex items-center gap-1" aria-label="Result progress">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          return (
            <li key={step.label} className={cn('flex min-w-0 items-center', !isLast && 'flex-1')}>
              <div
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-black',
                  step.state === 'done' && 'border-[var(--state-verified)]/40 bg-[var(--state-verified-bg)] text-[var(--state-verified)]',
                  step.state === 'current' && 'border-[var(--state-pending)]/50 bg-[var(--state-pending-bg)] text-[var(--state-pending)]',
                  step.state === 'problem' && 'border-[var(--state-disputed)]/50 bg-[var(--state-disputed-bg)] text-[var(--state-disputed)]',
                  step.state === 'upcoming' && 'border-white/12 bg-white/[0.03] text-[var(--text-3)]'
                )}
                aria-label={`${step.label}: ${step.state}`}
              >
                {step.state === 'done' ? (
                  <CheckmarkCircle01Icon className="size-3.5" />
                ) : step.state === 'problem' ? (
                  <Alert02Icon className="size-3.5" />
                ) : step.state === 'current' ? (
                  <Clock01Icon className="size-3.5" />
                ) : (
                  i + 1
                )}
              </div>
              {!isLast && (
                <div
                  className={cn(
                    'mx-1 h-px min-w-2 flex-1 rounded-full',
                    step.state === 'done' ? 'bg-[var(--state-verified)]/35' : 'bg-white/10'
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {current && (
        <p className="mt-2.5 text-xs leading-5 text-[var(--text-2)]">
          <span className="font-bold text-white">{current.label}</span>
          {current.hint && <span className="text-[var(--text-3)]"> · {current.hint}</span>}
        </p>
      )}
    </div>
  );
}
