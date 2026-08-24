import 'server-only';

import type { Firestore, Transaction } from 'firebase-admin/firestore';

/**
 * A league always has somebody accountable for it.
 *
 * ADR-003 makes League Admin the only operator role in a league, which means the failure it
 * introduces is a league with nobody left holding it: no one to register an athlete, resolve
 * an exception, or assign a Field Manager, and no one the platform can escalate to. Before
 * ADR-004 that was survivable because Team Admins could still run their own clubs. It is not
 * survivable now.
 *
 * Enforced at the assignment layer rather than hidden in the interface, because the interface
 * is not the enforcement point: the same transition is reachable from the platform console,
 * a script, and any future surface, and only one of those renders a button.
 *
 * The exemption is explicit rather than implied. A league may have no accountable admin when
 * Platform has deliberately taken it over or suspended it, both of which are states someone
 * chose and recorded, not states a league drifts into by losing its last operator.
 */

/** Roles that count as accountable for a league. Owner counts: they can do everything an admin can. */
export const ACCOUNTABLE_LEAGUE_ROLE_KEYS = ['league_admin', 'league_owner'] as const;

/** League states in which having no accountable admin is a deliberate, recorded decision. */
export const UNADMINISTERED_LEAGUE_STATUSES = ['platform_managed', 'suspended'] as const;

export type LastAdminVerdict =
  | { ok: true }
  | { ok: false; reason: string };

function isAccountable(data: FirebaseFirestore.DocumentData | undefined) {
  return (
    data?.scopeType === 'league'
    && data?.status === 'active'
    && ACCOUNTABLE_LEAGUE_ROLE_KEYS.includes(String(data?.roleKey) as (typeof ACCOUNTABLE_LEAGUE_ROLE_KEYS)[number])
  );
}

/**
 * May this assignment stop being active?
 *
 * Called inside the same transaction that performs the transition, so the count cannot go
 * stale between the check and the write. Two admins revoked concurrently would otherwise each
 * observe the other still active and both succeed, which is precisely the race this exists to
 * lose safely.
 */
export async function assertLeagueKeepsAnAdmin(
  db: Firestore,
  transaction: Transaction,
  input: {
    assignmentId: string;
    /** The assignment as it will be after this transition. */
    scopeType: string;
    scopeId: string;
    roleKey: string;
    nextStatus: string;
  },
): Promise<LastAdminVerdict> {
  // Only a league assignment leaving active state can strand a league.
  if (input.scopeType !== 'league') return { ok: true };
  if (input.nextStatus === 'active') return { ok: true };
  if (!ACCOUNTABLE_LEAGUE_ROLE_KEYS.includes(input.roleKey as (typeof ACCOUNTABLE_LEAGUE_ROLE_KEYS)[number])) {
    return { ok: true };
  }

  const leagueSnapshot = await transaction.get(db.collection('leagues').doc(input.scopeId));
  const leagueStatus = String(leagueSnapshot.data()?.status ?? '');
  if (UNADMINISTERED_LEAGUE_STATUSES.includes(leagueStatus as (typeof UNADMINISTERED_LEAGUE_STATUSES)[number])) {
    return { ok: true };
  }

  const active = await transaction.get(
    db.collection('accessAssignments')
      .where('scopeType', '==', 'league')
      .where('scopeId', '==', input.scopeId)
      .where('status', '==', 'active'),
  );

  const remaining = active.docs.filter((doc) => doc.id !== input.assignmentId && isAccountable(doc.data()));
  if (remaining.length > 0) return { ok: true };

  return {
    ok: false,
    reason:
      'This is the last active League Admin for this league. Add a replacement first, or move the league to platform-managed or suspended.',
  };
}
