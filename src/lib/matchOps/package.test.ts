import { describe, expect, it } from 'vitest';
import type { Athlete, Match } from '@/types';
import { FORBIDDEN_PACKAGE_FIELDS, buildMatchPackage } from './package';

function athlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: 'athlete_1',
    legalName: 'Emmanuel Okello',
    registeredPosition: 'Forward',
    sport: 'football',
    teamId: 'team_home',
    leagueId: 'league_1',
    city: 'Kampala',
    country: 'Uganda',
    ageGroup: 'Senior',
    bio: '',
    verified: true,
    verificationStatus: 'verified',
    totalSupport: 0,
    supportersCount: 0,
    goalPlacePoints: 0,
    stats: {},
    impactNeeds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    // Everything below is the sensitive material that must not travel.
    invitedEmail: 'emmanuel@example.com',
    invitationToken: 'secret-token',
    invitationTokenHash: 'hash',
    ...overrides,
  } as Athlete;
}

const match = {
  id: 'match_1',
  sport: 'football',
  leagueId: 'league_1',
  seasonId: 'season_1',
  homeTeamId: 'team_home',
  awayTeamId: 'team_away',
  venue: 'Kampala Ground',
  scheduledAt: '2026-08-24T15:00:00.000Z',
  effectiveCapturePolicy: 'FIELD_REQUIRED',
} as unknown as Match;

function build() {
  return buildMatchPackage({
    match,
    homeTeamName: 'Kampala United',
    awayTeamName: 'City Stars',
    homeAthletes: [athlete()],
    awayAthletes: [athlete({ id: 'athlete_2', legalName: 'Musa Kato', teamId: 'team_away' })],
    packageVersion: 'v1',
  });
}

describe('the match package', () => {
  it('carries what a person on a touchline needs', () => {
    const built = build();

    expect(built.homeTeam.athletes[0]).toEqual({
      athleteId: 'athlete_1',
      registeredName: 'Emmanuel Okello',
      shirtNumber: '',
      positionCode: 'Forward',
      eligible: true,
    });
    expect(built.effectiveCapturePolicy).toBe('FIELD_REQUIRED');
  });

  /**
   * The completion test for the privacy design, asserted rather than inspected.
   *
   * This package is the largest deliberate export of athlete data the platform performs, onto
   * a device it does not control, held by somebody who is not an account holder. The failure
   * mode it guards against is not a mistake made today: it is a field added to `Athlete` a
   * year from now that quietly rides along because the builder spread the object.
   */
  it.each(FORBIDDEN_PACKAGE_FIELDS)('never carries %s, anywhere in the payload', (field) => {
    const serialized = JSON.stringify(build());

    expect(serialized).not.toContain(`"${field}"`);
  });

  it('carries no contact detail even when the athlete record holds one', () => {
    const serialized = JSON.stringify(build());

    expect(serialized).not.toContain('emmanuel@example.com');
    expect(serialized).not.toContain('secret-token');
  });

  it('tells the Field Manager about eligibility rather than asking them to decide', () => {
    const built = buildMatchPackage({
      match,
      homeTeamName: 'Kampala United',
      awayTeamName: 'City Stars',
      homeAthletes: [athlete({ verificationStatus: 'rejected' })],
      awayAthletes: [],
      packageVersion: 'v1',
    });

    expect(built.homeTeam.athletes[0].eligible).toBe(false);
  });

  it('carries only the two team sheets', () => {
    const built = build();

    // No other fixture, no league settings, no athlete outside these squads.
    expect(Object.keys(built).sort()).toEqual([
      'awayTeam', 'effectiveCapturePolicy', 'homeTeam', 'leagueId', 'matchId',
      'packageVersion', 'scheduledAt', 'seasonId', 'sport', 'venue',
    ]);
  });
});
