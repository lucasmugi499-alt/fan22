import type { Athlete } from '@/types';

/**
 * The athlete's registered identity, read from whichever field carries it.
 *
 * ADR-001 forbids a bare `name` or a bare `position` on an athlete document, and the reason
 * is not tidiness. An athlete has two names: the one the League registered and the one they
 * call themselves, and they belong to different owners. `athlete.name` is precisely how those
 * two domains leak into each other six months from now, when somebody reaches for the
 * obvious field. The same is true of position: what an athlete is registered as governs
 * eligibility and fantasy, what they prefer to play is theirs to say, and one unqualified
 * field cannot hold both.
 *
 * The old fields exist on documents written before the rename. They are read here and
 * nowhere else, so the fallback lives in one place and disappears in one edit once the
 * migration completes.
 *
 * ## Where the rename stops
 *
 * `officialAthleteMatchStats` denormalizes `position` onto a verified, versioned record, and
 * that stays. An athlete registered as a forward in 2026 who moves to midfield in 2027 must
 * not retroactively change what their 2026 match record says. Invariant 08 and invariant 04
 * meet there and 04 wins: this rename covers the live registration record, not history.
 */

type LegacyAthleteFields = {
  /** @deprecated Written before ADR-001. Read through `athleteLegalName`. */
  name?: string;
  /** @deprecated Written before ADR-001. Read through `athleteRegisteredPosition`. */
  position?: string;
};

export type AthleteIdentitySource = Partial<Pick<Athlete, 'legalName' | 'registeredPosition'>> & LegacyAthleteFields;

/**
 * The name on any surface rendering a verified statistic. Always. A persona nickname never
 * appears beside a career record: the record belongs to the registered person.
 */
export function athleteLegalName(athlete: AthleteIdentitySource | undefined): string {
  if (!athlete) return '';
  return athlete.legalName ?? athlete.name ?? '';
}

/** What eligibility, standings and fantasy read. Never a preferred position. */
export function athleteRegisteredPosition(athlete: AthleteIdentitySource | undefined): string {
  if (!athlete) return '';
  return athlete.registeredPosition ?? athlete.position ?? '';
}

/**
 * Fill the canonical fields from whichever shape a stored document has.
 *
 * Applied once at the data boundary, so nothing downstream has to know the rename happened.
 * The legacy keys are left on the object rather than stripped: a surface that still reads
 * one keeps working during the migration, and the guard is what stops new ones appearing.
 */
export function normalizeAthleteIdentity<T extends AthleteIdentitySource>(athlete: T): T {
  if (!athlete) return athlete;
  const legalName = athleteLegalName(athlete);
  const registeredPosition = athleteRegisteredPosition(athlete);
  if (athlete.legalName === legalName && athlete.registeredPosition === registeredPosition) {
    return athlete;
  }
  return { ...athlete, legalName, registeredPosition };
}

export function normalizeAthleteIdentities<T extends AthleteIdentitySource>(athletes: T[]): T[] {
  return athletes.map(normalizeAthleteIdentity);
}
