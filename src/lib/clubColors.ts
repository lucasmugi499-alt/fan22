/**
 * Deterministic club colours. The seed data carries no crest assets, so each club gets a
 * stable identity colour from a curated broadcast palette (claret, red, royal, sky...) keyed
 * off its id/name, the way real club pages are themed. Every entry is dark enough to carry
 * white text on its gradient. When clubs upload real crests, extracted colours replace this.
 */
export interface ClubColor {
  /** Accent for rings, edges and highlights. */
  primary: string;
  /** Deep shade anchoring the gradient. */
  dark: string;
  /** Hero-card gradient (white text safe). */
  gradient: string;
}

const PALETTE: [string, string][] = [
  ['#a11d40', '#3f0d1d'], // claret
  ['#c8102e', '#4a0a14'], // red
  ['#1d4ed8', '#0b1a44'], // royal blue
  ['#0284c7', '#082f49'], // sky blue
  ['#d97706', '#4a2a05'], // amber
  ['#059669', '#053b2c'], // emerald
  ['#7c3aed', '#2a1259'], // violet
  ['#ea580c', '#471c06'], // tangerine
  ['#0d9488', '#04302c'], // teal
  ['#e11d48', '#4c0519'], // crimson
  ['#4f46e5', '#1e1b4b'], // indigo
  ['#475569', '#0f172a'], // steel
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function clubColor(key: string): ClubColor {
  const [primary, dark] = PALETTE[hash(key) % PALETTE.length];
  return {
    primary,
    dark,
    gradient: `linear-gradient(120deg, ${primary} 0%, ${dark} 100%)`,
  };
}
