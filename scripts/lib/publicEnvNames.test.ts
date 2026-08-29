import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * No `NEXT_PUBLIC_` variable may be named like a secret.
 *
 * Next inlines every `NEXT_PUBLIC_*` value into the client bundle at build time. That is the
 * prefix's whole purpose, and it makes the name a security decision rather than a style one:
 * a secret carrying it is published the moment anything on the client reads it.
 *
 * `NEXT_PUBLIC_FIREBASE_DEMO_PASSWORD` sat in `.env.example` and `.env.local` for a long
 * time. It was never actually in a bundle, because only Node scripts read it — which is
 * exactly what made it dangerous rather than merely wrong. Nothing was broken, so nothing
 * drew attention to it, and the first component that reached for a demo password would have
 * found a plausibly-named variable and published it silently. A latent footgun with no
 * symptom is the kind that survives review.
 *
 * This checks NAMES, not values, so it is safe to run anywhere and cannot leak anything. It
 * covers every committed file that declares environment variables — `.env.example` and the
 * App Hosting overlays — plus source that references one.
 */

const ROOT = process.cwd();

/**
 * Substrings that make a name a credential. Deliberately broad: a false positive costs one
 * rename, a false negative costs a published secret.
 */
const SECRET_WORDS = ['PASSWORD', 'SECRET', 'PRIVATE_KEY', 'CREDENTIAL', 'API_KEY'];

/**
 * `NEXT_PUBLIC_FIREBASE_API_KEY` is the documented exception and is not a secret.
 *
 * A Firebase web API key is a public project identifier — it is embedded in every Firebase
 * web app by design, and access is controlled by Firestore rules and App Check, not by
 * keeping it hidden. It is listed here explicitly rather than by loosening the rule, so the
 * exception is a decision somebody made rather than a gap in the pattern.
 */
const ALLOWED = new Set([
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY',
]);

const PUBLIC_NAME = /NEXT_PUBLIC_[A-Z0-9_]+/g;

function offendingNames(text: string): string[] {
  const found = text.match(PUBLIC_NAME) ?? [];
  return [...new Set(found)].filter((name) => (
    !ALLOWED.has(name) && SECRET_WORDS.some((word) => name.includes(word))
  ));
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git' || entry === 'out') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry) && !entry.endsWith('publicEnvNames.test.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('NEXT_PUBLIC_ variable names', () => {
  it('declares no secret-shaped name in .env.example', () => {
    expect(offendingNames(readFileSync(path.join(ROOT, '.env.example'), 'utf8'))).toEqual([]);
  });

  it.each([
    'apphosting.yaml',
    'apphosting.demo.yaml',
    'apphosting.beta.yaml',
    'apphosting.production.yaml',
  ])('declares no secret-shaped name in %s', (file) => {
    expect(offendingNames(readFileSync(path.join(ROOT, file), 'utf8'))).toEqual([]);
  });

  it('reads no secret-shaped name anywhere in src or scripts', () => {
    // The declaration files above are where such a name is BORN; this is where one would be
    // USED, which is the step that actually inlines it into a bundle.
    const offenders = sourceFiles(path.join(ROOT, 'src'))
      .concat(sourceFiles(path.join(ROOT, 'scripts')))
      .flatMap((file) => offendingNames(readFileSync(file, 'utf8'))
        .map((name) => `${path.relative(ROOT, file)}: ${name}`));
    expect(offenders).toEqual([]);
  });

  it('catches the exact name this guard was written for', () => {
    // Guarding the guard: a regex that matched nothing would pass every test above.
    expect(offendingNames('const p = process.env.NEXT_PUBLIC_FIREBASE_DEMO_PASSWORD;'))
      .toEqual(['NEXT_PUBLIC_FIREBASE_DEMO_PASSWORD']);
  });

  it('still allows the Firebase web API key, which is a public identifier', () => {
    expect(offendingNames('NEXT_PUBLIC_FIREBASE_API_KEY=abc')).toEqual([]);
  });
});
