/**
 * Who acted, for records that outlive the account that made them.
 *
 * Until now the platform's actor was always a Firebase user, so `submittedByUserId` on an
 * official event was both the identity and the proof. Field capture breaks that: a Field
 * Manager holds a match-scoped bearer token, has no Firebase Auth user, and never appears
 * in `accessIndex`. An official event they produce has no uid to record, and inventing one
 * would make `request.auth != null` true for anyone holding a match link.
 *
 * So the actor becomes a discriminated union. `displayLabel` is a human label ("Joseph K.")
 * and deliberately not an identity: it is written for the reader of an audit trail, and
 * nothing may authorize from it.
 *
 * Relative imports only. This module compiles into the Cloud Functions bundle via
 * `../src/kernel/**` in functions/tsconfig.json, where a path alias survives into the
 * emitted CommonJS and fails at require time.
 */

export type Principal =
  | { principalType: 'user'; userId: string; displayLabel?: string }
  | {
      principalType: 'match_ops_session';
      matchSessionId: string;
      fieldManagerAssignmentId: string;
      displayLabel?: string;
    }
  | { principalType: 'system'; component: string };

export type PrincipalType = Principal['principalType'];

/**
 * The identifier to store beside the type. Deliberately a function rather than a shared
 * `id` field on the union: the three principals are identified by genuinely different
 * things, and flattening them into one key is how two facts end up in one field.
 */
export function principalId(principal: Principal): string {
  switch (principal.principalType) {
    case 'user':
      return principal.userId;
    case 'match_ops_session':
      return principal.matchSessionId;
    case 'system':
      return principal.component;
  }
}

/** A label safe to render in an audit trail. Never an authorization input. */
export function principalLabel(principal: Principal): string {
  if (principal.principalType === 'system') return principal.component;
  return principal.displayLabel ?? principalId(principal);
}

export function systemPrincipal(component: string): Principal {
  return { principalType: 'system', component };
}

export function userPrincipal(userId: string, displayLabel?: string): Principal {
  return displayLabel
    ? { principalType: 'user', userId, displayLabel }
    : { principalType: 'user', userId };
}

/**
 * The dual-version reader.
 *
 * A 1.0.0 official event predates `sourcePrincipal` and carries `submittedByUserId`. It is
 * interpreted as a user principal at read time and is never rewritten to carry one:
 * historical events keep their shape, which is invariant 14 and the reason no migration
 * script accompanies this change.
 *
 * Returns null only for a record that is neither shape, which callers must treat as a
 * refusal rather than defaulting to the system principal. Attributing an unreadable event
 * to the platform is worse than admitting it cannot be read.
 */
export function principalFromEvent(event: {
  sourcePrincipal?: Principal;
  submittedByUserId?: string;
}): Principal | null {
  if (event.sourcePrincipal) return event.sourcePrincipal;
  if (typeof event.submittedByUserId === 'string' && event.submittedByUserId.length > 0) {
    return { principalType: 'user', userId: event.submittedByUserId };
  }
  return null;
}

/**
 * Structural check, used by the emission guard and by anything reading a stored principal
 * back out of Firestore, where the type annotation is a claim rather than a guarantee.
 */
export function isPrincipal(value: unknown): value is Principal {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const label = candidate.displayLabel;
  if (label !== undefined && typeof label !== 'string') return false;

  switch (candidate.principalType) {
    case 'user':
      return typeof candidate.userId === 'string' && candidate.userId.length > 0;
    case 'match_ops_session':
      return (
        typeof candidate.matchSessionId === 'string' &&
        candidate.matchSessionId.length > 0 &&
        typeof candidate.fieldManagerAssignmentId === 'string' &&
        candidate.fieldManagerAssignmentId.length > 0
      );
    case 'system':
      return typeof candidate.component === 'string' && candidate.component.length > 0;
    default:
      return false;
  }
}

/**
 * How a result version became official. Separate from `status` so the public record can
 * read "Official" while the audit trail stays honest about how it got there.
 */
export type FinalizationSourceType =
  | 'field_capture'
  | 'league_post_match'
  | 'legacy_team_submission'
  | 'platform_exception_resolution';

/**
 * The four fields that answer "how did this become official?" without depending on anyone's
 * memory. Stored on the official result version, which is immutable and versioned, so the
 * answer cannot drift after the fact.
 */
export type ProvenanceQuad = {
  sourceType: FinalizationSourceType;
  /** The matchReport or resultSubmission id this version was built from. */
  sourceRecordId: string;
  sourcePrincipalType: PrincipalType;
  sourcePrincipalId: string;
};

export function provenanceQuad(input: {
  sourceType: FinalizationSourceType;
  sourceRecordId: string;
  principal: Principal;
}): ProvenanceQuad {
  return {
    sourceType: input.sourceType,
    sourceRecordId: input.sourceRecordId,
    sourcePrincipalType: input.principal.principalType,
    sourcePrincipalId: principalId(input.principal),
  };
}
