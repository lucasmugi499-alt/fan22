import { CAPTURE_POLICIES, isCapturePolicy, type CapturePolicy } from '@/lib/capturePolicy';

const RANK = new Map<CapturePolicy, number>(CAPTURE_POLICIES.map((policy, index) => [policy, index]));

export type CapturePolicyFloorDecision = {
  allowed: boolean;
  current: CapturePolicy;
  proposed: CapturePolicy;
  nextVersion?: number;
  existingFixturesChange: false;
  reason?: string;
};

export function decideCapturePolicyFloorChange(input: {
  current: unknown;
  proposed: unknown;
  expectedVersion: number;
  actualVersion: number;
}): CapturePolicyFloorDecision {
  const current = isCapturePolicy(input.current) ? input.current : 'POST_MATCH_ALLOWED';
  const proposed = isCapturePolicy(input.proposed) ? input.proposed : 'POST_MATCH_ALLOWED';
  const base = { current, proposed, existingFixturesChange: false as const };
  if (input.expectedVersion !== input.actualVersion) {
    return { ...base, allowed: false, reason: 'The policy settings changed after preview. Reload and review the current impact.' };
  }
  if ((RANK.get(proposed) ?? 0) < (RANK.get(current) ?? 0)) {
    return { ...base, allowed: false, reason: 'This command cannot loosen the Platform capture-policy floor.' };
  }
  if (proposed === current) {
    return { ...base, allowed: false, reason: 'The proposed policy is already the active floor.' };
  }
  return { ...base, allowed: true, nextVersion: input.actualVersion + 1 };
}

export function policiesBelow(policy: CapturePolicy) {
  const rank = RANK.get(policy) ?? 0;
  return CAPTURE_POLICIES.filter((candidate) => (RANK.get(candidate) ?? 0) < rank);
}
