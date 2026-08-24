/**
 * Shape enforcement for official events, at the moment they are emitted.
 *
 * The JSON files in `src/kernel/schemas/` are the published contract, addressed by `$id`.
 * Nothing loaded them: there is no JSON Schema library in either package.json, and no
 * module imported them, so the `required` array on `official-event.schema.json` described
 * a rule that was never applied. That was worse than having no schema, because the file
 * read as if it were enforcing.
 *
 * This guard is the enforcement. It is deliberately hand-written and dependency-free: the
 * kernel compiles into the Cloud Functions bundle, which declares exactly two runtime
 * dependencies and is policed by `verify:bundle`, and adding a validator runtime there to
 * interpret a documentation artifact is the wrong trade. `officialEventGuard.contract.test`
 * asserts the two stay in agreement, so the contract cannot drift away from what runs.
 *
 * Relative imports only, for the same bundle reason.
 */

import { isPrincipal } from '../principal';

export const SUPPORTED_EVENT_SCHEMA_VERSIONS = ['1.0.0', '2.0.0'] as const;

export type SupportedEventSchemaVersion = (typeof SUPPORTED_EVENT_SCHEMA_VERSIONS)[number];

/** Required on every version. Mirrors the intersection of both schema files. */
export const COMMON_REQUIRED_FIELDS = [
  'id',
  'eventType',
  'eventSchemaVersion',
  'sportDefinitionVersion',
  'sportId',
  'competitionId',
  'seasonId',
  'matchId',
  'sequence',
  'payload',
  'sourceClaimId',
  'officialResultVersion',
  'officialEventVersion',
  'verificationStatus',
  'idempotencyKey',
  'createdAt',
  'finalizedAt',
] as const;

/**
 * The one field that differs between versions, and the whole reason for the bump.
 *
 * 1.0.0 requires a uid, because when it was written every actor was a Firebase user.
 * 2.0.0 requires a principal instead, because a field-capture event is produced by a match
 * ops session that has none.
 */
export const VERSION_REQUIRED_FIELDS: Record<SupportedEventSchemaVersion, readonly string[]> = {
  '1.0.0': ['submittedByUserId'],
  '2.0.0': ['sourcePrincipal'],
};

export type OfficialEventShapeVerdict = {
  status: 'valid' | 'blocked';
  issues: string[];
};

function isPresent(value: unknown) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.length > 0;
  return true;
}

/**
 * Validate one official event against the schema version it declares.
 *
 * Both versions are accepted forever. A 1.0.0 event read back from Firestore years from
 * now must still validate, because history is never rewritten to match a newer model, and a
 * reader that rejects its own archive is a reader that has lost the archive.
 */
export function validateOfficialEventShape(event: unknown): OfficialEventShapeVerdict {
  const issues: string[] = [];

  if (typeof event !== 'object' || event === null) {
    return { status: 'blocked', issues: ['An official event must be an object.'] };
  }

  const record = event as Record<string, unknown>;
  const declaredVersion = record.eventSchemaVersion;

  if (typeof declaredVersion !== 'string') {
    return { status: 'blocked', issues: ['An official event must declare eventSchemaVersion.'] };
  }

  if (!SUPPORTED_EVENT_SCHEMA_VERSIONS.includes(declaredVersion as SupportedEventSchemaVersion)) {
    return {
      status: 'blocked',
      issues: [`Unknown official event schema version ${declaredVersion}.`],
    };
  }

  const version = declaredVersion as SupportedEventSchemaVersion;

  for (const field of COMMON_REQUIRED_FIELDS) {
    if (!isPresent(record[field])) issues.push(`Official events require ${field}.`);
  }

  for (const field of VERSION_REQUIRED_FIELDS[version]) {
    if (!isPresent(record[field])) {
      issues.push(`Official events at schema ${version} require ${field}.`);
    }
  }

  if (version === '2.0.0' && isPresent(record.sourcePrincipal) && !isPrincipal(record.sourcePrincipal)) {
    issues.push('sourcePrincipal is not a recognised principal.');
  }

  if (record.verificationStatus !== 'official') {
    issues.push('Official events must carry verificationStatus "official".');
  }

  if (typeof record.sequence !== 'number' || !Number.isInteger(record.sequence) || record.sequence < 1) {
    issues.push('Official events require a positive integer sequence.');
  }

  return { status: issues.length ? 'blocked' : 'valid', issues };
}
