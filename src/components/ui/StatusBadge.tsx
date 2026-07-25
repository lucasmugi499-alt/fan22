import { cn } from '@/lib/utils';
import {
  STATE,
  TONE_CLASS,
  stateForMatch,
  stateForSubmission,
  stateForVerification,
  type StateDescriptor,
} from '@/lib/statusSystem';
import type { Match, ResultSubmissionStatus, VerificationStatus } from '@/types';

/**
 * The single way trust state is shown. Colour + icon + label, always — never colour alone
 * (an accessibility requirement and the difference between decoration and information).
 * Every wrapper below routes through the same descriptor so "pending" can never
 * accidentally read as "official".
 */
export function StatusBadge({
  state,
  size = 'md',
  className,
}: {
  state: StateDescriptor;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const Icon = state.icon;
  const live = state.tone === 'live';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        TONE_CLASS[state.tone],
        className
      )}
      title={state.explanation}
    >
      <Icon
        weight={live ? 'fill' : 'bold'}
        className={cn(size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5', live && 'animate-live-pulse')}
      />
      {state.label}
    </span>
  );
}

export function MatchStatusBadge(props: {
  match: Pick<Match, 'status' | 'verificationStatus'>;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return <StatusBadge state={stateForMatch(props.match)} size={props.size} className={props.className} />;
}

export function VerificationBadge(props: {
  status: VerificationStatus;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <StatusBadge state={stateForVerification(props.status)} size={props.size} className={props.className} />
  );
}

export function SubmissionBadge(props: {
  status: ResultSubmissionStatus;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <StatusBadge state={stateForSubmission(props.status)} size={props.size} className={props.className} />
  );
}

export { STATE };
