import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { parseJsonBody } from '@/server/api/security';
import { requireMatchOpsSession } from '@/server/matchOps/session';
import { applyClockAction, gameClockMs, initialClockState } from '@/lib/matchOps/clock';
import type { ClockAction } from '@/lib/matchOps/clock';
import type { MatchClockState } from '@/types';

export const runtime = 'nodejs';

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('pause') }),
  z.object({ action: z.literal('resume') }),
  z.object({ action: z.literal('end_period') }),
  z.object({ action: z.literal('start_period'), period: z.enum(['1', '2', 'ET1', 'ET2']) }),
  z.object({ action: z.literal('full_time') }),
  z.object({
    action: z.literal('adjust'),
    deltaMs: z.number().int().min(-600_000).max(600_000),
    reason: z.string().trim().min(3).max(200),
  }),
]);

type ClockRequest = z.infer<typeof bodySchema>;

/** Translate the HTTP vocabulary to the state machine's vocabulary without erasing types. */
function clockActionFromRequest(input: ClockRequest): ClockAction {
  switch (input.action) {
    case 'start':
    case 'pause':
    case 'resume':
    case 'end_period':
    case 'full_time':
      return { type: input.action };
    case 'start_period':
      return { type: input.action, period: input.period };
    case 'adjust':
      return { type: input.action, deltaMs: input.deltaMs, reason: input.reason };
  }
}

/**
 * The clock, moved one transition at a time under optimistic concurrency.
 *
 * `version` is checked inside the transaction and the write is refused if it moved. Two
 * devices can hold a live view of the same match during a takeover, and the losing write must
 * lose cleanly rather than interleaving a pause from one with a resume from the other.
 */
export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const auth = await requireMatchOpsSession(request, matchId);
  if ('response' in auth) return auth.response;

  const parsed = await parseJsonBody(request, bodySchema, { maxBytes: 1_024 });
  if ('response' in parsed) return Response.json({ error: 'Invalid clock action.' }, { status: 400 });

  const now = new Date();
  const ref = adminDb.collection('matchClockStates').doc(matchId);

  try {
    const next = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = snapshot.exists
        ? ({ id: snapshot.id, ...snapshot.data() } as MatchClockState)
        : initialClockState(matchId, auth.session.sessionGeneration, now.toISOString());

      /**
       * A fenced session cannot move the clock.
       *
       * Events from a superseded session are quarantined because they are real observations
       * worth keeping. A clock transition is not an observation, it is an instruction, and an
       * instruction from a device that has been replaced is simply wrong.
       */
      if (auth.session.sessionGeneration < current.sessionGeneration) {
        throw new Error('This session has been replaced. Another device is running this match.');
      }

      const result = applyClockAction(current, clockActionFromRequest(parsed.data), now);
      if (!result.ok) throw new Error(result.reason);
      const persistedClock = Object.fromEntries(
        Object.entries(result.next).filter(([, value]) => value !== undefined),
      );

      transaction.set(ref, {
        ...persistedClock,
        sessionGeneration: auth.session.sessionGeneration,
        updatedAtServer: FieldValue.serverTimestamp(),
      });
      return result.next;
    });

    return Response.json({
      ok: true,
      clock: next,
      // Sent so the client can correct its local tick against the anchor rather than drifting.
      gameClockMs: gameClockMs(next, now),
      serverTime: now.toISOString(),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'The clock could not be updated.' },
      { status: 409 },
    );
  }
}
