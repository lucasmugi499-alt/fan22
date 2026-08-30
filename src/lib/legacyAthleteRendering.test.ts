import { describe, expect, it } from 'vitest';
import { athletePhoto } from './media';
import { normalizeAthleteIdentity, athleteLegalName } from './athleteIdentity';
import type { Athlete } from '@/types';

/**
 * `/athletes` returned a 500 in production, and this is the chain that caused it.
 *
 * ADR-001 renamed `name` to `legalName`. `firebaseProvider` applies `normalizeAthleteIdentity`
 * so the client never sees the old shape; the SERVER loaders in `publicCatalogue` did not. The
 * page renders the 48 most recently created athletes, and on the demo database all 48 are
 * pre-ADR-001 documents — so `athlete.legalName` was `undefined`, `AthleteCard` passed it to
 * `athletePhoto`, `initials()` called `.replace` on it, and the render threw.
 *
 * An anonymous visitor never gets past `initialData`, so there was no client read to repair it
 * afterwards. The page was simply down.
 *
 * Two layers are tested here, because one is the fix and the other is the reason it was a 500
 * rather than a blank crest.
 */

/** Exactly the shape the demo database holds for its oldest athletes. */
function legacyAthlete(): Athlete {
  return {
    id: 'ath_120',
    name: 'Irene Nakiwala',
    position: 'Fly-half',
    sport: 'rugby',
    teamId: 'team_rugby_05_01',
    leagueId: 'league_rugby_kampala',
    city: 'Kampala',
    goalPlacePoints: 40,
    totalSupport: 0,
    verified: true,
  } as unknown as Athlete;
}

describe('the boundary that should have adapted it', () => {
  it('fills legalName from the pre-ADR-001 name', () => {
    expect(normalizeAthleteIdentity(legacyAthlete()).legalName).toBe('Irene Nakiwala');
  });

  it('fills registeredPosition from the pre-ADR-001 position', () => {
    expect(normalizeAthleteIdentity(legacyAthlete()).registeredPosition).toBe('Fly-half');
  });

  it('leaves a modern document alone', () => {
    const modern = { ...legacyAthlete(), legalName: 'Real Name', registeredPosition: 'Striker' };
    const normalized = normalizeAthleteIdentity(modern as Athlete);
    expect(normalized.legalName).toBe('Real Name');
    expect(normalized.registeredPosition).toBe('Striker');
  });

  it('reads the same through the accessor, for a caller that has not normalized', () => {
    expect(athleteLegalName(legacyAthlete())).toBe('Irene Nakiwala');
  });
});

describe('the crest that turned a missing name into a 500', () => {
  it('does not throw when the name is absent', () => {
    // The actual production failure: `undefined.replace is not a function`, thrown during SSR
    // of a page whose data loader had not normalized.
    expect(() => athletePhoto({
      id: 'ath_120', legalName: undefined, avatarUrl: undefined, teamId: 'team_1',
    } as unknown as Parameters<typeof athletePhoto>[0])).not.toThrow();
  });

  it('still produces a usable image for a nameless athlete', () => {
    const photo = athletePhoto({
      id: 'ath_120', legalName: undefined, avatarUrl: undefined, teamId: 'team_1',
    } as unknown as Parameters<typeof athletePhoto>[0]);
    // A crest is decoration. A missing name should cost a blank crest, never a page.
    expect(photo.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('uses the initials when the name is present', () => {
    const photo = athletePhoto({
      id: 'ath_1', legalName: 'Irene Nakiwala', avatarUrl: undefined, teamId: 'team_1',
    } as unknown as Parameters<typeof athletePhoto>[0]);
    expect(decodeURIComponent(photo)).toContain('IN');
  });

  it('prefers a real photo over a generated crest', () => {
    expect(athletePhoto({
      id: 'ath_1', legalName: 'Irene Nakiwala', avatarUrl: 'https://example.test/a.jpg', teamId: 't',
    } as unknown as Parameters<typeof athletePhoto>[0])).toBe('https://example.test/a.jpg');
  });
});
