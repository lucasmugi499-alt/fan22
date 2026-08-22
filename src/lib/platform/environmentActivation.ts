/**
 * The guarded activation workflow.
 *
 * Activating an environment is not a toggle and this module is the reason it cannot become
 * one. Each step has to be recorded before the next is reachable, the approval must come
 * from someone other than the requester, and the routing step is an INSTRUCTION with a
 * manually reported outcome rather than an action — because no gateway or DNS control
 * exists in this deployment to action.
 *
 * The most dangerous thing a console can do is show a success state for something that did
 * not happen. A request can reach `routing_pending` and stop there forever; that is a
 * truthful end state, not a failure.
 */

export type ActivationEnvironment = 'beta' | 'production';

/**
 * The one sentence for the missing routing mechanism.
 *
 * Lives here rather than beside the readiness check so the console, the workflow and the
 * tests all quote the same words. An operator who reads a different phrasing on the page
 * than in the refusal has to work out whether they are looking at two problems or one.
 */
export const ROUTING_BLOCKER =
  'No traffic-routing mechanism exists, so traffic cannot be moved to this environment.';

export type ActivationStage =
  | 'draft'
  | 'readiness_checked'
  | 'approved'
  | 'maintenance_requested'
  | 'routing_pending'
  | 'smoke_confirmed'
  | 'completed'
  | 'abandoned';

export type ActivationAction =
  | 'record_readiness'
  | 'approve'
  | 'request_maintenance'
  | 'issue_routing_instruction'
  | 'confirm_smoke'
  | 'complete'
  | 'abandon';

export type ActivationRequest = {
  id: string;
  environment: ActivationEnvironment;
  stage: ActivationStage;
  requestedByUserId: string;
  approvedByUserId?: string;
  /**
   * Every readiness blocker found at the time readiness was recorded, the routing wall
   * included. Kept whole for the audit trail: what the operator was told when they started
   * is the thing worth being able to read back later. Approval is gated on a freshly
   * measured subset, not on this snapshot.
   */
  readinessBlockers?: string[];
  createdAt: string;
  updatedAt: string;
};

/** The one legal successor for each action. Anything else is refused. */
const TRANSITIONS: Record<ActivationAction, { from: ActivationStage[]; to: ActivationStage }> = {
  record_readiness: { from: ['draft'], to: 'readiness_checked' },
  approve: { from: ['readiness_checked'], to: 'approved' },
  request_maintenance: { from: ['approved'], to: 'maintenance_requested' },
  issue_routing_instruction: { from: ['maintenance_requested'], to: 'routing_pending' },
  confirm_smoke: { from: ['routing_pending'], to: 'smoke_confirmed' },
  complete: { from: ['smoke_confirmed'], to: 'completed' },
  // Available from any live stage: abandoning is always allowed, finishing is not.
  abandon: {
    from: ['draft', 'readiness_checked', 'approved', 'maintenance_requested', 'routing_pending', 'smoke_confirmed'],
    to: 'abandoned',
  },
};

export type ActivationDecision =
  | { ok: true; nextStage: ActivationStage }
  | { ok: false; reason: string };

export function decideActivationTransition(input: {
  request: Pick<ActivationRequest, 'stage' | 'environment' | 'requestedByUserId'>;
  action: ActivationAction;
  actorUserId: string;
  /** What the operator typed. Must match the environment name exactly. */
  typedConfirmation?: string;
  /**
   * Configuration faults measured at this moment. Approval is refused while any stand.
   *
   * Deliberately narrower than the full readiness blocker list. The missing routing
   * mechanism is also a readiness blocker, but gating approval on it would make every
   * stage past `readiness_checked` unreachable — the workflow could never record the
   * approval, the maintenance window or the routing instruction it exists to capture, and
   * the console would describe a process no operator could actually walk. The routing wall
   * is enforced at `confirm_smoke` instead, which is the step it truthfully blocks.
   */
  approvalBlockers?: string[];
  /** Whether a routing mechanism actually exists. Today: never. */
  routingAvailable: boolean;
}): ActivationDecision {
  const transition = TRANSITIONS[input.action];
  if (!transition) return { ok: false, reason: 'Unknown activation action.' };
  if (!transition.from.includes(input.request.stage)) {
    return {
      ok: false,
      reason: `Cannot ${input.action.replace(/_/g, ' ')} from stage ${input.request.stage}.`,
    };
  }

  if (input.action === 'abandon') return { ok: true, nextStage: transition.to };

  // Typed confirmation on every forward step, not just the last. A workflow that only asks
  // once trains the operator to clear one dialog and stop reading.
  if (input.typedConfirmation !== input.request.environment) {
    return {
      ok: false,
      reason: `Type the environment name (${input.request.environment}) to confirm this step.`,
    };
  }

  if (input.action === 'approve') {
    // Two people. The requester approving their own activation is the single control most
    // worth keeping, because it is the one an operator under time pressure will want to skip.
    if (input.actorUserId === input.request.requestedByUserId) {
      return { ok: false, reason: 'Activation approval requires a second operator.' };
    }
    if (input.approvalBlockers?.length) {
      return {
        ok: false,
        reason: `Readiness is blocked: ${input.approvalBlockers.join('; ')}`,
      };
    }
  }

  if (input.action === 'confirm_smoke' && !input.routingAvailable) {
    // The honest wall. Smoke tests confirm traffic reached the new target; with no routing
    // mechanism there is no new target, so confirming would be recording a fiction.
    return {
      ok: false,
      reason: 'Smoke tests cannot be confirmed: no traffic-routing mechanism exists, so traffic has not moved.',
    };
  }

  return { ok: true, nextStage: transition.to };
}

/** Stages an operator can still act on. Used to keep the console honest about what is live. */
export function isTerminalStage(stage: ActivationStage) {
  return stage === 'completed' || stage === 'abandoned';
}
