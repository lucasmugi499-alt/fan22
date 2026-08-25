import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { RETIRING_TEAM_CAPABILITIES } from '../../src/lib/auth/access';

/**
 * What must be true after team authority is retired, and what must remain readable.
 *
 * The distinction this enforces is the one the whole sunset turns on: retire authority,
 * preserve history. A check that demanded zero team assignments would be demanding the
 * deletion of the records that make hundreds of historical submissions interpretable. A check
 * that demanded nothing would let a stale projection keep granting authority that no longer
 * exists in any bundle, which is the exact divergence the access engine was rebuilt to close.
 *
 * So: no LIVE authority, and no NEW issuance. Everything historical stays.
 */

const TEAM_CAPABILITIES = new Set<string>(Object.values(RETIRING_TEAM_CAPABILITIES).flat());

export type InvariantViolation = { invariant: string; detail: string; count: number };

export type InvariantInput = {
  /** Every stored accessIndex document. */
  indexes: { id: string; scopeType?: string; capabilities?: string[] }[];
  invitations: { id: string; scopeType?: string; status?: string; roleKey?: string }[];
  submissions: { id: string; status?: string }[];
};

const OPEN_INVITATION_STATUSES = ['sent', 'delivered', 'viewed', 'queued', 'invited'];
const TEAM_ANSWERABLE = ['pending_confirmation', 'confirmation_overdue'];

export function checkTeamSunsetInvariants(input: InvariantInput): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  /**
   * The one that actually protects anything.
   *
   * Changing the capability catalogue does not rewrite already-materialized projections, so a
   * team index written before retirement keeps granting until it is rebuilt. Until this reads
   * zero, the retirement has happened in the code and not in the database.
   */
  const liveTeamCapabilities = input.indexes.filter((index) =>
    (index.capabilities ?? []).some((capability) => TEAM_CAPABILITIES.has(capability)));
  if (liveTeamCapabilities.length) {
    violations.push({
      invariant: 'no team capabilities in live access indexes',
      detail: `${liveTeamCapabilities.length} projection(s) still grant retired team capabilities. Rebuild them.`,
      count: liveTeamCapabilities.length,
    });
  }

  const openTeamInvitations = input.invitations.filter((invitation) =>
    invitation.scopeType === 'team' && OPEN_INVITATION_STATUSES.includes(String(invitation.status)));
  if (openTeamInvitations.length) {
    violations.push({
      invariant: 'no issuable Team Admin invitations',
      detail: `${openTeamInvitations.length} team invitation(s) could still be accepted, creating an assignment that grants nothing.`,
      count: openTeamInvitations.length,
    });
  }

  const openV1 = input.submissions.filter((submission) =>
    TEAM_ANSWERABLE.includes(String(submission.status)));
  if (openV1.length) {
    violations.push({
      invariant: 'no V1 workflow awaiting a team',
      detail: `${openV1.length} claim(s) are waiting on a team that can no longer answer.`,
      count: openV1.length,
    });
  }

  return violations;
}

function initialize() {
  if (getApps().length) return getFirestore();
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  initializeApp(raw ? { credential: cert(JSON.parse(raw)) } : { credential: applicationDefault() });
  return getFirestore();
}

export async function runTeamSunsetInvariants(db: Firestore) {
  const [indexes, invitations, submissions] = await Promise.all([
    db.collection('accessIndex').get(),
    db.collection('invitations').where('scopeType', '==', 'team').get(),
    db.collection('resultSubmissions').get(),
  ]);

  const violations = checkTeamSunsetInvariants({
    indexes: indexes.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    invitations: invitations.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    submissions: submissions.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  });

  console.log('Team Admin sunset invariants');
  console.log(`  Access indexes scanned      ${indexes.size}`);
  console.log(`  Team invitations scanned    ${invitations.size}`);
  console.log(`  Result submissions scanned  ${submissions.size}`);

  if (!violations.length) {
    console.log('\nAll invariants hold. Historical team assignments and V1 records remain readable.');
    return violations;
  }

  console.log('');
  for (const violation of violations) {
    console.log(`  VIOLATED  ${violation.invariant}`);
    console.log(`            ${violation.detail}`);
  }
  return violations;
}

async function main() {
  const violations = await runTeamSunsetInvariants(initialize());
  process.exitCode = violations.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
