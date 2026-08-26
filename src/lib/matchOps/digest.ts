import { createHash } from 'node:crypto';

/**
 * What an attested report actually attested to.
 *
 * A Field Manager confirms a record at full time. The events beneath it live in their own
 * collection and can still change: a quarantined session syncs at 17:04, a correction lands at
 * 17:06, and the report still says `ready_for_finalization`. Without a binding between the two,
 * finalization consumes whatever the collection happens to hold at the moment it runs, and the
 * official result is built from a set of events nobody attested to.
 *
 * The score comparison catches the loud version of that, where the total moved. It cannot catch
 * the quiet one: a goal reattributed from one athlete to another leaves the score identical and
 * changes whose career record it lands on. So the binding is over content, not over a total.
 *
 * ## Why a digest rather than a version number alone
 *
 * A counter answers "has anything changed since". A digest answers "is this the same set", which
 * is the question finalization needs: after a crash, a retry, or an out-of-order delivery, the
 * counter may have moved and returned, or moved for a reason that does not affect this report.
 * The digest is a fact about the events themselves.
 */

/** The fields that make an event the event it is. Anything here changing is a different set. */
type DigestibleEvent = {
  eventId: string;
  eventType: string;
  teamId: string;
  athleteId: string | null;
  gameClockMs: number;
  status: string;
  payload?: Record<string, unknown> | null;
};

/**
 * A stable digest over an event set.
 *
 * Sorted by event id, so two devices replaying the same queue in different orders produce the
 * same digest: arrival order is a property of the network, not of the match.
 *
 * `status` is included, which is what makes a correction visible. Superseding an event does not
 * remove it, so a set with a superseded goal and a set where that goal is still active contain
 * the same ids and are not the same record.
 *
 * The payload's `value` is included because basketball carries points there, and a two changed
 * to a three is a different match with the same event count.
 */
export function computeEventDigest(events: DigestibleEvent[]): string {
  const canonical = [...events]
    .sort((a, b) => (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0))
    .map((event) => [
      event.eventId,
      event.eventType,
      event.teamId,
      event.athleteId ?? '',
      String(event.gameClockMs),
      event.status,
      String(event.payload?.value ?? ''),
    ].join('|'))
    .join('\n');

  return createHash('sha256').update(canonical).digest('hex');
}

/** Only the events that contribute to the official record. */
export function activeEvents<T extends { status: string }>(events: T[]) {
  return events.filter((event) => event.status === 'active');
}

export type ReportBinding = {
  /** How many events existed when this report was attested, across every status. */
  eventCount: number;
  /** The digest of that exact set. */
  eventDigest: string;
  /**
   * A monotonic counter over writes to this match's event stream.
   *
   * Cheap to compare and, unlike the digest, orderable: it tells an operator whether the stream
   * moved forward or was rewritten, which the digest alone cannot.
   */
  eventStreamVersion: number;
};

export function bindReportToEvents(events: DigestibleEvent[], eventStreamVersion: number): ReportBinding {
  return {
    eventCount: events.length,
    eventDigest: computeEventDigest(events),
    eventStreamVersion,
  };
}

export type BindingVerdict =
  | { matches: true }
  | { matches: false; reason: 'event_set_changed'; attested: ReportBinding; current: ReportBinding };

/**
 * Does the event set still match what was attested?
 *
 * Compared on the digest rather than the count, because a correction that supersedes one event
 * and appends its replacement changes the record while leaving the count higher by exactly one,
 * and a count check would call that "two new events" or, worse, pass.
 */
export function verifyReportBinding(attested: ReportBinding, current: ReportBinding): BindingVerdict {
  if (attested.eventDigest === current.eventDigest) return { matches: true };
  return { matches: false, reason: 'event_set_changed', attested, current };
}

/**
 * The candidate's identity.
 *
 * Three parts, because two are not enough. `field_capture:report_381` would be a stable name for
 * a changing thing: re-attest after a late event and the same id would mean a different set of
 * sporting claims, so a retry could not tell whether it was replaying its own work or committing
 * somebody else's.
 *
 * With the version in the name, `field_capture:report_381:v4` always means exactly one set of
 * claims, forever. A changed source produces v5 rather than a changed v4.
 */
export function candidateIdFor(input: {
  sourceType: string;
  sourceRecordId: string;
  sourceVersion: number;
}) {
  return `${input.sourceType}:${input.sourceRecordId}:v${input.sourceVersion}`;
}
