import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The capture interface must never show a Field Manager anything about fantasy.
 *
 * A Field Manager who knows the athlete in front of them is owned by forty percent of
 * managers is a Field Manager with a reason to hesitate. The whole design depends on them
 * having none: no fantasy consideration may ever reach a sporting decision, and the cheapest
 * way to guarantee that is for the capture surface to have no access to the data at all.
 *
 * Enforced as a source-level check rather than a rendering test because the failure mode is
 * someone importing a fantasy module for a seemingly innocent reason. An import is the thing
 * to prevent; what gets rendered from it is downstream of that.
 */

const CAPTURE_DIRECTORY = join(process.cwd(), 'src/components/matchops');

function captureSources() {
  return readdirSync(CAPTURE_DIRECTORY)
    .filter((file) => (file.endsWith('.tsx') || file.endsWith('.ts')) && !file.includes('.test.'))
    .map((file) => ({ file, source: readFileSync(join(CAPTURE_DIRECTORY, file), 'utf8') }));
}

describe('capture surface is isolated from fantasy', () => {
  it('has files to check, so a rename cannot make this suite vacuously pass', () => {
    expect(captureSources().length).toBeGreaterThan(0);
  });

  it('imports nothing from the fantasy modules', () => {
    for (const { file, source } of captureSources()) {
      expect(source, `${file} imports a fantasy module`).not.toMatch(
        /from\s+['"][^'"]*(?:lib\/fantasy|server\/fantasy|types\/fantasy)[^'"]*['"]/,
      );
    }
  });

  it('names no fantasy ownership, points, or scout concept', () => {
    const forbidden = [
      /ownershipPercentage/,
      /fantasyPoints/,
      /fantasyTeam/,
      /scoutAthleteId/,
      /captainAthleteId/,
      /\bfantasy\b/i,
    ];
    for (const { file, source } of captureSources()) {
      for (const pattern of forbidden) {
        expect(source, `${file} references ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
