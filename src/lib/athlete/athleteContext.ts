import type { Athlete, UserProfile } from '@/types';

/**
 * Resolves the athlete the current user is, by `userId`.
 *
 * In demo mode only, an unlinked profile falls back to the most-supported athlete so the
 * portfolio has real content. A real unlinked user returns `null`: showing someone else's
 * career record as your own would misrepresent a verified profile.
 */
export function resolveMyAthlete(
  profile: UserProfile | null,
  athletes: Athlete[],
  isDemoMode = false
): Athlete | null {
  if (athletes.length === 0) return null;
  if (profile) {
    const mine = athletes.find((a) => a.userId === profile.uid || a.userId === profile.id);
    if (mine) return mine;
    const profileName = (profile.displayName ?? profile.name ?? '').trim().toLowerCase();
    if (profileName) {
      const byName = athletes.find((a) => a.name.trim().toLowerCase() === profileName);
      if (byName) return byName;
    }
  }
  if (!isDemoMode) return null;
  return [...athletes].sort((a, b) => (b.totalSupport ?? 0) - (a.totalSupport ?? 0))[0];
}

/** Human labels for the raw stat keys stored on an athlete. */
export const STAT_LABELS: Record<string, string> = {
  matches: 'Matches',
  matchesPlayed: 'Matches',
  goals: 'Goals',
  assists: 'Assists',
  points: 'Points',
  rebounds: 'Rebounds',
  tries: 'Tries',
  tackles: 'Tackles',
  cleanSheets: 'Clean sheets',
  minutes: 'Minutes',
  appearances: 'Appearances',
  wins: 'Wins',
  mvp: 'MVP awards',
};

export function statLabel(key: string): string {
  return STAT_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}
