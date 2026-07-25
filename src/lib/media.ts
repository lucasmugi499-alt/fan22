import type { Athlete } from '@/types';
import { clubColor } from '@/lib/clubColors';

/**
 * Self-contained placeholder imagery.
 *
 * Earlier builds hotlinked randomuser.me / picsum.photos. That is wrong for a deployed
 * product: it leaks a referrer to a third party on every card, it fails silently when the
 * host is slow or blocked (a real risk on the networks this product targets), and stock
 * portraits misrepresent who these athletes are. Everything here is generated as an inline
 * SVG data URI, so it renders offline, instantly, and identically every time.
 *
 * A real uploaded `avatarUrl` always wins; these only fill the gap while seed data has none.
 */

function svg(markup: string): string {
  // encodeURIComponent keeps this safe for both src attributes and CSS url().
  return `data:image/svg+xml,${encodeURIComponent(markup)}`;
}

function initials(name: string): string {
  return name
    .replace(/[^A-Za-z ]/g, '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Portrait placeholder: the athlete's initials on their club's identity gradient. Reads as a
 * deliberate design choice rather than a broken image.
 */
export function athletePhoto(
  athlete: Pick<Athlete, 'id' | 'name' | 'avatarUrl' | 'avatarURL' | 'teamId'>
): string {
  const real = athlete.avatarUrl || athlete.avatarURL;
  if (real) return real;
  const { primary, dark } = clubColor(athlete.teamId || athlete.id);
  return svg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${primary}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><text x="100" y="100" fill="rgba(255,255,255,0.92)" font-family="system-ui,sans-serif" font-size="76" font-weight="700" text-anchor="middle" dominant-baseline="central">${initials(athlete.name)}</text></svg>`
  );
}

/** Wide banner placeholder for cover images and news cards. */
export function bannerImage(seed: string, label?: string): string {
  const { primary, dark } = clubColor(seed);
  const caption = label
    ? `<text x="40" y="176" fill="rgba(255,255,255,0.5)" font-family="system-ui,sans-serif" font-size="15" font-weight="600" letter-spacing="3">${label.slice(0, 28).toUpperCase()}</text>`
    : '';
  return svg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${primary}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><rect width="480" height="200" fill="url(#g)"/><circle cx="410" cy="34" r="120" fill="rgba(255,255,255,0.06)"/><circle cx="70" cy="180" r="90" fill="rgba(0,0,0,0.12)"/>${caption}</svg>`
  );
}
