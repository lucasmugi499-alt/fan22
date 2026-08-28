import 'server-only';

import { createHash } from 'node:crypto';
import { platformCommand, type PlatformCommandTier } from '@/lib/platform/commandRegistry';
import { decideCapturePolicyFloorChange } from '@/lib/platform/capturePolicyFloor';

export type PlatformCommandFacts = {
  exists?: boolean;
  name?: string;
  status?: string;
  version?: string | number;
  updatedAt?: string;
  conflictWithMatch?: boolean;
  dependencyCounts?: Record<string, number>;
  readinessBlockers?: string[];
  currentGeneration?: number;
  lastObservedAt?: string;
  capturePolicyFloor?: string;
  proposedPolicyFloor?: string;
  affectedSeasonCount?: number;
  existingFixtureCount?: number;
  /** What a merge would move and leave, counted live. */
  mergeMoves?: Array<{ what: string; count: number }>;
  mergePreserved?: Array<{ what: string; count: number }>;
  mergeSurvivorName?: string;
  mergeRefusal?: string;
};

export type ConsequencePreview = {
  commandId: string;
  label: string;
  tier: PlatformCommandTier;
  targetId: string | null;
  targetLabel: string | null;
  changes: string[];
  remains: string[];
  notifications: string[];
  reversibility: string;
  blockers: string[];
  available: boolean;
  disabledReason: string | null;
  reasonRequired: boolean;
  acknowledgementRequired: boolean;
  confirmationPhrase: string | null;
  audit: {
    action: string;
    targetCollection: string;
    targetId: string | null;
  };
  stateFingerprint: string;
  issuedAt: string;
  expiresAt: string;
};

function totalDependencies(counts: Record<string, number> | undefined) {
  return Object.values(counts ?? {}).reduce((sum, count) => sum + count, 0);
}

function commandChanges(commandId: string, facts: PlatformCommandFacts) {
  if (commandId === 'integrity.exception.ratify') {
    return ['Resolve the operational exception with an attributed decision.'];
  }
  if (commandId === 'integrity.match.force_takeover') {
    return ['Fence the current Match Ops generation.', 'Create a new attributed operator session.'];
  }
  if (commandId === 'application.approve_and_invite') {
    return ['Create or reuse the organization, league, and opening season atomically.', 'Queue one owner invitation.'];
  }
  if (commandId === 'invitation.resend') {
    return ['Rotate the invitation token and expiry.', 'Queue a new provider-attributed delivery attempt.'];
  }
  if (commandId === 'invitation.revoke') {
    return ['Invalidate the unaccepted invitation while preserving its delivery history.'];
  }
  if (commandId === 'invitation.bulk_resend') {
    return ['Rotate and resend only the server-validated invitation rows.', 'Record a separate provider attempt and audit event for every row.'];
  }
  if (commandId === 'integrity.capture_policy_floor.set') {
    return [
      `Raise the floor from ${facts.capturePolicyFloor ?? 'POST_MATCH_ALLOWED'} to ${facts.proposedPolicyFloor ?? 'the selected policy'} for fixtures created after this change.`,
      `${facts.affectedSeasonCount ?? 0} current season configuration(s) request a lower policy and will be tightened for newly created fixtures.`,
    ];
  }
  if (commandId.startsWith('environment.activation.')) {
    return [`Advance the activation record from ${facts.status ?? 'its current stage'} after live readiness checks.`];
  }
  if (commandId === 'site.update_settings') {
    return ['Publish only the reviewed site-setting fields if the version is still current.'];
  }
  if (commandId.endsWith('.merge')) {
    const moves = facts.mergeMoves ?? [];
    const survivor = facts.mergeSurvivorName ?? 'the surviving record';
    return [
      ...moves.map((move) => `Move ${move.count} ${move.what.toLowerCase()} to ${survivor}.`),
      `Archive this record and point it at ${survivor}, so every existing link keeps resolving.`,
    ];
  }
  if (commandId.includes('.archive')) return ['Archive the record and remove it from public discovery.'];
  if (commandId.includes('.suspend')) return ['Suspend the record until an operator restores it.'];
  if (commandId.includes('.restore')) return ['Restore the record to its prior operational lifecycle.'];
  if (commandId.includes('.activate')) return ['Activate the record and make it eligible for its configured visibility.'];
  if (commandId === 'network.draft.hard_delete') return ['Permanently delete an unused draft record.'];
  return ['Apply the requested audited workflow transition.'];
}

function unchangedFacts(commandId: string, liveFacts: PlatformCommandFacts) {
  const facts = ['The endpoint will recheck authority and current state before writing.'];
  if (commandId.startsWith('network.') || commandId.startsWith('integrity.')) {
    facts.push('Official results, events, standings, statistics, and data-quality tiers remain unchanged.');
  }
  if (commandId === 'integrity.match.force_takeover') {
    facts.push('Queued events from the fenced generation are quarantined rather than merged or discarded.');
  }
  if (commandId.startsWith('environment.activation.')) {
    facts.push('Recording or advancing this request does not move production traffic.');
  }
  if (commandId.endsWith('.merge')) {
    for (const preserved of liveFacts.mergePreserved ?? []) {
      facts.push(`${preserved.count} ${preserved.what.toLowerCase()} stay attached to the absorbed record.`);
    }
    facts.push('No official result is reattributed. A played match keeps the identity that played it.');
    facts.push('Nothing is deleted; the absorbed record stays readable through its merge pointer.');
  }
  if (commandId === 'integrity.capture_policy_floor.set') {
    facts.push(`${liveFacts.existingFixtureCount ?? 0} existing fixture binding(s) remain unchanged; policy is frozen when each fixture is created.`);
    facts.push('No score, event, result, standing, statistic, or stored quality tier is changed.');
  }
  return facts;
}

function notificationFacts(commandId: string) {
  if (commandId === 'integrity.match.force_takeover') return ['The displaced Match Ops operator is visible in the new exception and audit trail.'];
  if (commandId === 'application.approve_and_invite') return ['The applicant receives the owner invitation through the configured delivery channel.'];
  if (commandId === 'invitation.resend') return ['The invited email address receives a new link only if the provider accepts the attempt.'];
  if (commandId === 'invitation.bulk_resend') return ['Every valid row targets its invitation’s currently stored email address.'];
  if (commandId.startsWith('environment.activation.')) return ['Activation reviewers can see the new stage and its measured blockers.'];
  if (commandId.startsWith('media.')) return ['The uploader sees the resulting moderation state.'];
  if (commandId.startsWith('payee.')) return ['Only redacted payout state is exposed outside the payment workflow.'];
  return [];
}

function reversibilityFor(commandId: string, tier: PlatformCommandTier) {
  if (commandId === 'network.draft.hard_delete') return 'Irreversible after confirmation.';
  if (commandId === 'integrity.match.force_takeover') return 'The generation fence is permanent; a later takeover creates another generation.';
  if (commandId === 'integrity.exception.ratify') return 'The audit decision is permanent; a sporting correction requires a new governed result version.';
  if (commandId === 'application.approve_and_invite') return 'Created records remain historical; the invitation and assignments can be revoked through their own workflows.';
  if (commandId === 'integrity.capture_policy_floor.set') return 'Existing fixtures keep their frozen binding. This command only tightens the floor; it cannot loosen it.';
  if (commandId.endsWith('.merge')) {
    return 'Undoing a merge means restoring the absorbed record and moving every reference back by hand. '
      + 'Nothing is destroyed, but nothing is automatically returned either.';
  }
  if (commandId === 'invitation.revoke') return 'Revocation is permanent; restoring access requires a new invitation or assignment.';
  if (tier === 'governed') return 'The recorded step is permanent; later stages use an explicit follow-up transition.';
  if (tier === 'consequential') return 'Reversible through a separate audited command when policy allows.';
  return 'Reversible through the corresponding audited workflow.';
}

function blockersFor(commandId: string, targetId: string | null, facts: PlatformCommandFacts, inputs: Record<string, unknown>) {
  const blockers: string[] = [];
  if (targetId && facts.exists === false) blockers.push('The target no longer exists. Reload and choose another record.');
  // A merge the planner already refuses must not offer a runnable button.
  if (facts.mergeRefusal) blockers.push(facts.mergeRefusal);
  if (commandId === 'integrity.exception.ratify') {
    if (facts.conflictWithMatch) {
      blockers.push('You are affiliated with a club in this match. Another unconflicted operator must decide.');
    }
    if (facts.status === 'resolved' || facts.status === 'superseded') {
      blockers.push('This exception is already closed.');
    }
  }
  if (commandId === 'integrity.match.force_takeover' && facts.status === 'full_time') {
    blockers.push('This match has finished. Use the governed post-match workflow instead.');
  }
  if (commandId === 'network.draft.hard_delete' && totalDependencies(facts.dependencyCounts) > 0) {
    blockers.push('This draft has attached records. Archive it instead of deleting history.');
  }
  if ((commandId === 'invitation.resend' || commandId === 'invitation.revoke')
    && ['accepted', 'revoked', 'superseded'].includes(String(facts.status))) {
    blockers.push('This invitation is no longer active. Use the governed assignment workflow instead.');
  }
  if (commandId === 'integrity.capture_policy_floor.set') {
    const decision = decideCapturePolicyFloorChange({
      current: facts.capturePolicyFloor,
      proposed: facts.proposedPolicyFloor,
      expectedVersion: Number(inputs.expectedVersion ?? facts.version ?? 0),
      actualVersion: Number(facts.version ?? 0),
    });
    if (!decision.allowed && decision.reason) blockers.push(decision.reason);
  }
  blockers.push(...(facts.readinessBlockers ?? []));
  return blockers;
}

/** Pure consequence computation; routes supply live facts and callers cannot override policy. */
export function buildConsequencePreview(input: {
  commandId: string;
  targetId?: string | null;
  inputs?: Record<string, unknown>;
  facts?: PlatformCommandFacts;
  now?: Date;
}): ConsequencePreview {
  const command = platformCommand(input.commandId);
  if (!command) throw new Error('Unknown Platform command.');
  const facts = input.facts ?? {};
  const targetId = input.targetId ?? null;
  const now = input.now ?? new Date();
  const blockers = blockersFor(command.id, targetId, facts, input.inputs ?? {});
  const stateFingerprint = createHash('sha256').update(JSON.stringify({
    commandId: command.id,
    targetId,
    inputs: input.inputs ?? {},
    facts,
  })).digest('hex');

  return {
    commandId: command.id,
    label: command.label,
    tier: command.tier,
    targetId,
    targetLabel: facts.name ?? targetId,
    changes: commandChanges(command.id, facts),
    remains: unchangedFacts(command.id, facts),
    notifications: notificationFacts(command.id),
    reversibility: reversibilityFor(command.id, command.tier),
    blockers,
    available: blockers.length === 0,
    disabledReason: blockers[0] ?? null,
    reasonRequired: command.reason === 'required',
    acknowledgementRequired: command.confirmation === 'acknowledge',
    confirmationPhrase: command.confirmation.startsWith('type:')
      ? command.confirmation.slice('type:'.length)
      : null,
    audit: {
      action: command.audit.action,
      targetCollection: command.audit.targetCollection,
      targetId,
    },
    stateFingerprint,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
  };
}
