import type { Athlete, Match } from '@/types';
import { athleteLegalName, athleteRegisteredPosition } from '@/lib/athleteIdentity';

/**
 * What goes onto a Field Manager's phone, and what must never.
 *
 * The package is downloaded and cached before kickoff, because after kickoff there may be no
 * signal at all. That makes it the largest deliberate export of athlete data the platform
 * performs, onto a device the platform does not control, held by somebody who is not an
 * account holder, for five hours.
 *
 * So the exclusions are the design, not a precaution. A Field Manager needs a shirt number, a
 * name to tap and a face to recognise. They do not need a date of birth, a phone number, an
 * email, a payee record or a verification document, and a package that carried them would put
 * a league's entire registration database on a borrowed Android whenever somebody was asked
 * to cover a fixture.
 *
 * The exclusion list is asserted by a test rather than maintained by convention, because the
 * failure mode is a field somebody adds to `Athlete` a year from now that quietly rides along.
 * The builder allow-lists rather than deny-lists for the same reason.
 */

export type PackageAthlete = {
  athleteId: string;
  /**
   * The registered name, named as such.
   *
   * Calling this `displayName` would put the League's registered name in a field named after
   * the athlete's own nickname, which is precisely the leak ADR-001 exists to prevent, one
   * document removed. A Field Manager is identifying a person on a team sheet; matching a
   * nickname against a shirt is how the wrong athlete gets a goal.
   */
  registeredName: string;
  shirtNumber: string;
  positionCode: string;
  photoThumb?: string;
  eligible: boolean;
};

export type MatchPackage = {
  packageVersion: string;
  matchId: string;
  leagueId: string;
  seasonId: string;
  sport: string;
  venue: string;
  scheduledAt: string;
  effectiveCapturePolicy: string;
  homeTeam: { teamId: string; name: string; athletes: PackageAthlete[] };
  awayTeam: { teamId: string; name: string; athletes: PackageAthlete[] };
};

/** The only athlete fields that reach the device. Allow-list, never a deny-list. */
function packageAthlete(athlete: Athlete): PackageAthlete {
  return {
    athleteId: athlete.id,
    registeredName: athleteLegalName(athlete),
    shirtNumber: String((athlete as { shirtNumber?: string | number }).shirtNumber ?? ''),
    positionCode: athleteRegisteredPosition(athlete),
    ...(athlete.avatarUrl || athlete.avatarURL
      ? { photoThumb: athlete.avatarUrl ?? athlete.avatarURL }
      : {}),
    // Computed by the League before issue. The Field Manager is told, never asked to decide.
    eligible: athlete.verificationStatus !== 'rejected',
  };
}

export function buildMatchPackage(input: {
  match: Match;
  homeTeamName: string;
  awayTeamName: string;
  homeAthletes: Athlete[];
  awayAthletes: Athlete[];
  packageVersion: string;
}): MatchPackage {
  const { match } = input;
  return {
    packageVersion: input.packageVersion,
    matchId: match.id,
    leagueId: match.leagueId,
    seasonId: match.seasonId,
    sport: String(match.sport),
    venue: match.venue,
    scheduledAt: match.scheduledAt,
    // Carried so the client knows whether a fallback is even available, without asking.
    effectiveCapturePolicy: match.effectiveCapturePolicy ?? 'POST_MATCH_ALLOWED',
    homeTeam: {
      teamId: match.homeTeamId,
      name: input.homeTeamName,
      athletes: input.homeAthletes.map(packageAthlete),
    },
    awayTeam: {
      teamId: match.awayTeamId,
      name: input.awayTeamName,
      athletes: input.awayAthletes.map(packageAthlete),
    },
  };
}

/** Fields that must never appear anywhere in a package. Asserted by test, not by convention. */
export const FORBIDDEN_PACKAGE_FIELDS = [
  'email',
  'invitedEmail',
  'phone',
  'dateOfBirth',
  'dob',
  'payee',
  'payeeId',
  'bankAccount',
  'mobileMoneyNumber',
  'verificationEvidence',
  'invitationToken',
  'invitationTokenHash',
  'nationalId',
] as const;
