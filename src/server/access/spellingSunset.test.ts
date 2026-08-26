import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The compatibility shim stays deleted.
 *
 * `SUPERSEDED_CAPABILITY_EQUIVALENTS` let a stored pre-ADR-003 capability name satisfy the
 * capability that replaced it, so League Admins kept working between the deploy and the
 * projection rebuild. It was correct, and it was scaffolding: the whole reason it was
 * acceptable is that it had a stated deletion condition, and the condition was met on
 * 2026-08-26 when the demo projections were rebuilt and `access:migrate:gate` read zero.
 *
 * This test exists because compatibility code with no expiry mechanism becomes permanent by
 * default. Nobody ever decides to keep it; it is simply never the thing anybody is working on.
 * And a permanent alias is not a small cost — two spellings for one permission make capability
 * audits, revocation, Rules comparison, search and documentation non-deterministic forever.
 *
 * What is forbidden is the ALIAS, in live authorization code. Deprecated names remain in the
 * capability catalogue with their deprecation reasons, and every historical audit record keeps
 * its own words: an `AuditEvent` that says `league.team.create` still says it. Rewriting
 * history is a different mistake from removing an alias.
 */

/** The names ADR-003/ADR-004 replaced, which must never again grant on their own. */
const SUPERSEDED = ['league.team.create', 'league.roster.verify', 'league.team_admin.invite'];

/** Live authorization surfaces. Both were widened together and had to narrow together. */
const ENFORCEMENT_POINTS = [
  'src/server/access/capabilities.ts',
  'firestore.rules.next',
];

function withoutComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('superseded capability spellings stay sunset', () => {
  it.each(ENFORCEMENT_POINTS)('%s grants nothing from a superseded name', (path) => {
    const code = withoutComments(readFileSync(path, 'utf8'));
    for (const name of SUPERSEDED) {
      expect(code, `${path} still grants on ${name}`).not.toContain(name);
    }
  });

  it('has no equivalence map left to reintroduce', () => {
    const code = withoutComments(readFileSync('src/server/access/capabilities.ts', 'utf8'));
    expect(code).not.toContain('SUPERSEDED_CAPABILITY_EQUIVALENTS');
    expect(code).not.toContain('acceptedSpellings');
  });

  /**
   * The half-migration that actually happened, guarded directly.
   *
   * The Rules helper was widened and the server check was not, so Rules said yes and the route
   * said no. Asserting the two lists agree catches the same mistake in either direction —
   * including somebody re-widening one of them alone.
   */
  it('keeps Rules and the server on the same spellings', () => {
    const rules = withoutComments(readFileSync('firestore.rules.next', 'utf8'));
    const match = rules.match(/function hasLeagueOperatorCapability\(leagueId\) \{[\s\S]*?\}\s*\n/);
    expect(match, 'hasLeagueOperatorCapability not found in firestore.rules.next').toBeTruthy();
    const listed = [...match![0].matchAll(/'(league\.[a-z_.]+)'/g)].map((entry) => entry[1]);

    expect(listed.length).toBeGreaterThan(0);
    for (const capability of listed) {
      expect(SUPERSEDED, `Rules still list superseded ${capability}`).not.toContain(capability);
    }
  });

  it('leaves the deprecated names in the catalogue, with their reasons', () => {
    // Deleting these would erase why the rename happened, and would break every stored audit
    // record's ability to be explained. The alias is gone; the vocabulary's history is not.
    const catalogue = readFileSync('src/lib/auth/access.ts', 'utf8');
    for (const name of SUPERSEDED) {
      expect(catalogue, `${name} vanished from the capability catalogue`).toContain(name);
    }
  });
});
