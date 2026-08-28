import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { platformCommand } from '@/lib/platform/commandRegistry';
import { hasCapability } from '@/server/access/capabilities';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { resolveConflictContext } from '@/server/conflict/resolveConflictContext';
import {
  buildConsequencePreview,
  type PlatformCommandFacts,
} from '@/server/platform/commands/consequencePreview';
import { environmentReadiness, routingMechanismAvailable } from '@/server/platform/environmentReadiness';
import { mergeDependencies, networkDependencies, type NetworkObjectKind } from '@/server/platform/networkDependencies';
import { policiesBelow } from '@/lib/platform/capturePolicyFloor';
import { planMerge } from '@/lib/platform/merge';
import { isCapturePolicy } from '@/lib/capturePolicy';

export const runtime = 'nodejs';

const bodySchema = z.object({
  commandId: z.string().trim().min(1).max(160),
  targetId: z.string().trim().min(1).max(240).optional(),
  inputs: z.record(z.string(), z.unknown()).default({}),
}).strict();

function asIso(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return undefined;
}

function targetCollection(commandId: string, fallback: string, inputs: Record<string, unknown>) {
  if (fallback !== 'network object') return fallback;
  const kind = inputs.kind;
  if (kind === 'league') return 'leagues';
  if (kind === 'team') return 'teams';
  if (kind === 'athlete') return 'athletes';
  return commandId.includes('.athlete.') ? 'athletes'
    : commandId.includes('.team.') ? 'teams'
      : commandId.includes('.league.') ? 'leagues' : null;
}

async function loadLiveFacts(input: {
  actorUserId: string;
  commandId: string;
  targetId?: string;
  collection: string | null;
  inputs: Record<string, unknown>;
}): Promise<PlatformCommandFacts> {
  const facts: PlatformCommandFacts = {};
  let data: FirebaseFirestore.DocumentData | undefined;

  if (input.targetId && input.collection) {
    const snapshot = await adminDb.collection(input.collection).doc(input.targetId).get();
    facts.exists = snapshot.exists;
    data = snapshot.data();
    facts.name = typeof data?.name === 'string'
      ? data.name
      : typeof data?.leagueName === 'string'
        ? data.leagueName
        : typeof data?.summary === 'string' ? data.summary : input.targetId;
    const status = data?.lifecycleStatus ?? data?.status ?? data?.stage ?? data?.state;
    if (typeof status === 'string') facts.status = status;
    if (typeof data?.version === 'number' || typeof data?.version === 'string') facts.version = data.version;
    facts.updatedAt = asIso(data?.updatedAt);
  }

  if (input.commandId === 'network.draft.hard_delete' && input.targetId) {
    const kind = input.inputs.kind;
    if (kind === 'league' || kind === 'team' || kind === 'athlete') {
      facts.dependencyCounts = await networkDependencies(kind as NetworkObjectKind, input.targetId);
    }
  }

  /*
   * A merge preview runs the same planner the write path runs, against live counts, so the
   * sheet shows the operator the decision that will actually be made rather than a
   * description of one. A planner refusal becomes a blocker, which disables the button.
   */
  if (input.commandId.endsWith('.merge')) {
    const mergeKind = input.commandId.includes('.athlete.') ? 'athlete' as const : 'team' as const;
    const duplicateId = typeof input.inputs.duplicateId === 'string' ? input.inputs.duplicateId : input.targetId;
    const survivorId = typeof input.inputs.survivorId === 'string' ? input.inputs.survivorId : '';
    if (duplicateId && survivorId) {
      const collection = mergeKind === 'athlete' ? 'athletes' : 'teams';
      const [duplicateSnapshot, survivorSnapshot, dependencies] = await Promise.all([
        adminDb.collection(collection).doc(duplicateId).get(),
        adminDb.collection(collection).doc(survivorId).get(),
        mergeDependencies(mergeKind, duplicateId),
      ]);
      const duplicateData = duplicateSnapshot.data() ?? {};
      const survivorData = survivorSnapshot.data() ?? {};
      const survivorName = String(survivorData.name ?? survivorData.legalName ?? survivorId);
      facts.mergeSurvivorName = survivorName;
      const lifecycleOf = (value: unknown) =>
        value === 'draft' || value === 'suspended' || value === 'archived' || value === 'active'
          ? value
          : 'active';
      const plan = planMerge({
        kind: mergeKind,
        duplicate: {
          id: duplicateId,
          name: String(duplicateData.name ?? duplicateData.legalName ?? duplicateId),
          lifecycleState: lifecycleOf(duplicateData.lifecycleStatus),
          mergedIntoId: typeof duplicateData.mergedIntoId === 'string' ? duplicateData.mergedIntoId : null,
          leagueId: typeof duplicateData.leagueId === 'string' ? duplicateData.leagueId : null,
        },
        survivor: {
          id: survivorId,
          name: survivorName,
          lifecycleState: lifecycleOf(survivorData.lifecycleStatus),
          mergedIntoId: typeof survivorData.mergedIntoId === 'string' ? survivorData.mergedIntoId : null,
          leagueId: typeof survivorData.leagueId === 'string' ? survivorData.leagueId : null,
        },
        dependencies,
        allowCrossLeague: input.inputs.allowCrossLeague === true,
      });
      if (plan.ok) {
        facts.mergeMoves = plan.moves;
        facts.mergePreserved = plan.preserved;
      } else {
        facts.mergeRefusal = plan.reason;
      }
    } else {
      facts.mergeRefusal = 'Choose the record that survives before this can be previewed.';
    }
  }

  if (input.commandId === 'integrity.exception.ratify' && typeof data?.matchId === 'string') {
    const conflict = await resolveConflictContext({
      principal: { principalType: 'user', userId: input.actorUserId },
      matchId: data.matchId,
    });
    facts.conflictWithMatch = conflict.conflictWithMatch;
  }

  if (input.commandId === 'integrity.match.force_takeover' && input.targetId) {
    const clock = await adminDb.collection('matchClockStates').doc(input.targetId).get();
    const clockData = clock.data();
    if (typeof clockData?.state === 'string') facts.status = clockData.state;
    if (typeof clockData?.sessionGeneration === 'number') facts.currentGeneration = clockData.sessionGeneration;
    facts.lastObservedAt = asIso(clockData?.updatedAt);
  }

  if (input.commandId.startsWith('environment.activation.') && data) {
    const environment = data.environment;
    if (environment === 'beta' || environment === 'production') {
      const readiness = await environmentReadiness(environment, routingMechanismAvailable());
      facts.readinessBlockers = readiness.configBlockers;
    }
  }

  if (input.commandId === 'integrity.capture_policy_floor.set' && data) {
    const proposed = input.inputs.proposedFloor;
    facts.capturePolicyFloor = typeof data.capturePolicyFloor === 'string' ? data.capturePolicyFloor : 'POST_MATCH_ALLOWED';
    facts.proposedPolicyFloor = typeof proposed === 'string' ? proposed : undefined;
    if (isCapturePolicy(proposed)) {
      const lower = policiesBelow(proposed);
      const [seasons, fixtures] = await Promise.all([
        adminDb.collection('seasons').get(),
        adminDb.collection('matches').where('status', '==', 'scheduled').count().get(),
      ]);
      facts.affectedSeasonCount = seasons.docs.filter((document) => {
        const policy = document.data().capturePolicy;
        return lower.includes(isCapturePolicy(policy) ? policy : 'POST_MATCH_ALLOWED');
      }).length;
      facts.existingFixtureCount = fixtures.data().count;
    }
  }

  return facts;
}

/**
 * Server-owned consequence preview. The client supplies intent, never policy facts.
 * Execution still goes to the command's existing trusted endpoint, which repeats authority
 * and state-machine checks against the state current at write time.
 */
export async function POST(request: Request) {
  const guarded = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 12 * 1024,
    invalidBodyError: 'A registered Platform command is required.',
    accountClass: 'platform_operator',
    rateLimit: { bucket: 'platform_command_preview', limit: 120, windowSeconds: 300 },
  });
  if ('response' in guarded) return guarded.response;

  const command = platformCommand(guarded.data.commandId);
  if (!command) return Response.json({ error: 'Unknown Platform command.' }, { status: 404 });

  const permitted = await hasCapability(
    guarded.actor.uid,
    { scopeType: 'platform', scopeId: 'global' },
    command.capability,
  );
  if (!permitted) {
    return Response.json({ error: `Missing platform capability: ${command.capability}.` }, { status: 403 });
  }

  const collection = targetCollection(command.id, command.audit.targetCollection, guarded.data.inputs);
  const facts = await loadLiveFacts({
    actorUserId: guarded.actor.uid,
    commandId: command.id,
    targetId: guarded.data.targetId,
    collection,
    inputs: guarded.data.inputs,
  });
  const preview = buildConsequencePreview({
    commandId: command.id,
    targetId: guarded.data.targetId,
    inputs: guarded.data.inputs,
    facts,
  });

  return Response.json({ preview }, { headers: { 'cache-control': 'no-store' } });
}
