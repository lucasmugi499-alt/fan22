import { describe, expect, it } from 'vitest';
import { ROUTING_BLOCKER, decideActivationTransition, isTerminalStage } from './environmentActivation';

const base = {
  stage: 'draft' as const,
  environment: 'beta' as const,
  requestedByUserId: 'operator_1',
};

function decide(overrides: Parameters<typeof decideActivationTransition>[0]) {
  return decideActivationTransition(overrides);
}

describe('environment activation workflow', () => {
  it('refuses a step taken out of order', () => {
    // The whole point of a workflow over a toggle: you cannot jump to the end.
    const outcome = decide({
      request: base,
      action: 'confirm_smoke',
      actorUserId: 'operator_2',
      typedConfirmation: 'beta',
      routingAvailable: true,
    });
    expect(outcome).toEqual({ ok: false, reason: 'Cannot confirm smoke from stage draft.' });
  });

  it('requires the environment name typed on every forward step', () => {
    for (const typed of [undefined, '', 'BETA', 'production', 'bet']) {
      expect(decide({
        request: base, action: 'record_readiness', actorUserId: 'operator_1',
        typedConfirmation: typed, routingAvailable: false,
      })).toMatchObject({ ok: false });
    }
    expect(decide({
      request: base, action: 'record_readiness', actorUserId: 'operator_1',
      typedConfirmation: 'beta', routingAvailable: false,
    })).toEqual({ ok: true, nextStage: 'readiness_checked' });
  });

  it('refuses self-approval', () => {
    // The control an operator under time pressure will most want to skip.
    const outcome = decide({
      request: { ...base, stage: 'readiness_checked' },
      action: 'approve',
      actorUserId: 'operator_1',
      typedConfirmation: 'beta',
      routingAvailable: false,
    });
    expect(outcome).toEqual({ ok: false, reason: 'Activation approval requires a second operator.' });
  });

  it('accepts approval from a second operator', () => {
    expect(decide({
      request: { ...base, stage: 'readiness_checked' },
      action: 'approve', actorUserId: 'operator_2',
      typedConfirmation: 'beta', routingAvailable: false,
    })).toEqual({ ok: true, nextStage: 'approved' });
  });

  it('refuses approval while configuration faults stand', () => {
    const outcome = decide({
      request: { ...base, stage: 'readiness_checked' },
      action: 'approve', actorUserId: 'operator_2',
      typedConfirmation: 'beta', routingAvailable: false,
      approvalBlockers: ['Configuration still contains placeholder values.'],
    });
    expect(outcome).toMatchObject({ ok: false });
    expect((outcome as { reason: string }).reason).toContain('placeholder');
  });

  it('approves when the absent routing mechanism is the only thing outstanding', () => {
    // The contradiction this guards against: the routing wall is a readiness blocker, and
    // it is permanent today. Gating approval on it would make every stage after readiness
    // unreachable, leaving the console describing a process no operator could walk. It is
    // enforced at smoke confirmation instead, which is the step it truthfully blocks.
    expect(decide({
      request: { ...base, stage: 'readiness_checked' },
      action: 'approve', actorUserId: 'operator_2',
      typedConfirmation: 'beta', routingAvailable: false,
      approvalBlockers: [],
    })).toEqual({ ok: true, nextStage: 'approved' });
  });

  it('will not confirm smoke tests while no routing mechanism exists', () => {
    // The honest wall. Confirming would record that traffic moved when nothing can move it.
    const outcome = decide({
      request: { ...base, stage: 'routing_pending' },
      action: 'confirm_smoke', actorUserId: 'operator_2',
      typedConfirmation: 'beta', routingAvailable: false,
    });
    expect(outcome).toMatchObject({ ok: false });
    expect((outcome as { reason: string }).reason).toContain('no traffic-routing mechanism');
  });

  it('reaches routing_pending today and stops there', () => {
    // The truthful end state for this deployment: everything a human can record is
    // recorded, and the step that needs infrastructure is left visibly outstanding.
    //
    // Walked with the routing blocker standing, exactly as the live workflow sees it, so
    // this fails if approval is ever re-gated on the full readiness list.
    let stage: string = 'draft';
    for (const action of ['record_readiness', 'approve', 'request_maintenance', 'issue_routing_instruction'] as const) {
      const outcome = decide({
        request: { ...base, stage: stage as never },
        action, actorUserId: 'operator_2',
        typedConfirmation: 'beta', routingAvailable: false,
        approvalBlockers: [],
      });
      expect(outcome).toMatchObject({ ok: true });
      stage = (outcome as { nextStage: string }).nextStage;
    }
    expect(stage).toBe('routing_pending');
    expect(isTerminalStage('routing_pending')).toBe(false);

    // And it stops. The only forward step left is refused, naming the same wall the
    // readiness report names.
    const blocked = decide({
      request: { ...base, stage: 'routing_pending' },
      action: 'confirm_smoke', actorUserId: 'operator_2',
      typedConfirmation: 'beta', routingAvailable: false,
    });
    expect(blocked).toMatchObject({ ok: false });
    expect((blocked as { reason: string }).reason.toLowerCase()).toContain('no traffic-routing mechanism');
    expect(ROUTING_BLOCKER.toLowerCase()).toContain('no traffic-routing mechanism');
  });

  it('allows abandoning from any live stage without typing anything', () => {
    for (const stage of ['draft', 'readiness_checked', 'approved', 'maintenance_requested', 'routing_pending'] as const) {
      expect(decide({
        request: { ...base, stage }, action: 'abandon',
        actorUserId: 'operator_2', routingAvailable: false,
      })).toEqual({ ok: true, nextStage: 'abandoned' });
    }
  });

  it('cannot restart a terminal request', () => {
    for (const stage of ['completed', 'abandoned'] as const) {
      expect(decide({
        request: { ...base, stage }, action: 'record_readiness',
        actorUserId: 'operator_2', typedConfirmation: 'beta', routingAvailable: false,
      })).toMatchObject({ ok: false });
      expect(isTerminalStage(stage)).toBe(true);
    }
  });
});
