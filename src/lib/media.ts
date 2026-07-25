import type { Athlete } from '@/types';

/**
 * Placeholder portrait for an athlete with no uploaded photo. Deterministic per athlete and
 * gender-matched by first name so demo cards read as credible people, not random faces. The
 * seed data carries no photos, so every demo athlete flows through here; a real `avatarUrl`
 * always wins.
 */
const FEMALE_FIRST = new Set([
  'amina', 'faridah', 'grace', 'irene', 'juliet', 'martha', 'miriam', 'norah', 'patricia', 'rebecca', 'sarah',
]);

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function athletePhoto(athlete: Pick<Athlete, 'id' | 'name' | 'avatarUrl' | 'avatarURL'>): string {
  const real = athlete.avatarUrl || athlete.avatarURL;
  if (real) return real;
  const first = athlete.name.split(' ')[0]?.toLowerCase() ?? '';
  const gender = FEMALE_FIRST.has(first) ? 'women' : 'men';
  return `https://randomuser.me/api/portraits/${gender}/${hash(athlete.id) % 100}.jpg`;
}
