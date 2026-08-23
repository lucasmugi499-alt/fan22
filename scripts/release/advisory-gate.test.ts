import { describe, expect, it } from 'vitest';
import { evaluateAdvisories } from './advisory-gate';

/**
 * Fixtures use the full waiver schema, because the gate now requires it: an entry that
 * cannot name its advisory, tree, path, classification and owner — and give real analysis
 * for reason, reachability and mitigation — is not a decision anyone can review.
 */
function waiver(overrides: Record<string, unknown> = {}) {
  return {
    advisoryId: 'GHSA-test-0001',
    package: 'next',
    severity: 'high' as const,
    tree: 'root' as const,
    dependencyPath: 'next > postcss',
    classification: 'runtime-build',
    scope: 'runtime-build',
    status: 'accepted-temporarily' as const,
    reason: 'Current upstream version has no safe patched replacement available today.',
    reachability: 'No untrusted CSS reaches the parser; only build-time author CSS is processed.',
    mitigation: 'No untrusted CSS is processed at runtime, and the build input is repo-controlled.',
    owner: 'repository owner',
    reviewedAt: '2026-07-30',
    expiresOn: '2026-08-30',
    ...overrides,
  };
}

const register = {
  reviewedAt: '2026-07-30',
  entries: [
    waiver(),
    waiver({
      advisoryId: 'GHSA-test-0002',
      package: '*',
      packages: ['glob'],
      classification: 'dev-tooling',
      scope: 'dev',
      dependencyPath: 'eslint > glob',
      reason: 'Development-only tooling chain with no patched release in range yet.',
      reachability: 'Not shipped in any deployed artifact; runs only on developer machines.',
      mitigation: 'No production runtime exposure; executed only during local builds.',
    }),
  ],
};

describe('dependency advisory gate', () => {
  it('passes registered temporary exceptions', () => {
    const result = evaluateAdvisories({
      vulnerabilities: {
        next: {
          name: 'next',
          severity: 'high',
          isDirect: true,
          via: ['postcss'],
        },
        glob: {
          name: 'glob',
          severity: 'high',
          isDirect: false,
          via: ['minimatch'],
        },
      },
    }, register, '2026-07-31');

    expect(result.ok).toBe(true);
    expect(result.acknowledged).toHaveLength(2);
  });

  it('fails unknown advisories', () => {
    const result = evaluateAdvisories({
      vulnerabilities: {
        unknown: {
          name: 'unknown',
          severity: 'moderate',
          isDirect: false,
          via: [],
        },
      },
    }, register, '2026-07-31');

    expect(result.ok).toBe(false);
    expect(result.problems.join('\n')).toMatch(/unregistered/);
  });

  it('fails critical advisories even when registered', () => {
    const result = evaluateAdvisories({
      vulnerabilities: {
        next: {
          name: 'next',
          severity: 'critical',
          isDirect: true,
          via: ['postcss'],
        },
      },
    }, register, '2026-07-31');

    expect(result.ok).toBe(false);
    expect(result.problems.join('\n')).toMatch(/critical/);
  });

  it('fails expired exceptions', () => {
    const result = evaluateAdvisories({
      vulnerabilities: {
        next: {
          name: 'next',
          severity: 'high',
          isDirect: true,
          via: ['postcss'],
        },
      },
    }, register, '2026-09-01');

    expect(result.ok).toBe(false);
    expect(result.problems.join('\n')).toMatch(/expired/);
  });
});

describe('waiver evidence requirements', () => {
  const vulnerability = (severity: 'moderate' | 'high' | 'critical') => ({
    vulnerabilities: { next: { name: 'next', severity, isDirect: true, via: ['postcss'] } },
  });
  const withEntry = (entry: Record<string, unknown>) => ({ reviewedAt: '2026-07-30', entries: [entry] });

  it('refuses a waiver that does not name its advisory, tree, path, classification or owner', () => {
    for (const field of ['advisoryId', 'tree', 'dependencyPath', 'classification', 'owner']) {
      const result = evaluateAdvisories(
        vulnerability('moderate'),
        withEntry(waiver({ [field]: '' })),
        '2026-07-31',
      );
      expect(result.ok, `${field} should be required`).toBe(false);
      expect(result.problems.join('\n')).toMatch(new RegExp(`does not name.*${field}`));
    }
  });

  it('refuses a waiver whose analysis is a shrug', () => {
    // "n/a", "transitive", "dev only" — the answers that make a register undecidable.
    for (const field of ['reason', 'reachability', 'mitigation']) {
      const result = evaluateAdvisories(
        vulnerability('moderate'),
        withEntry(waiver({ [field]: 'n/a' })),
        '2026-07-31',
      );
      expect(result.ok, `${field} should require analysis`).toBe(false);
      expect(result.problems.join('\n')).toMatch(/no real analysis/);
    }
  });

  it('never lets a critical advisory through, however complete the waiver', () => {
    const result = evaluateAdvisories(vulnerability('critical'), withEntry(waiver()), '2026-07-31');
    expect(result.ok).toBe(false);
    expect(result.problems.join('\n')).toMatch(/critical advisories cannot be waived/);
  });

  it('demands a reachability analysis for high-severity runtime advisories', () => {
    const result = evaluateAdvisories(
      vulnerability('high'),
      withEntry(waiver({ reachability: 'transitive' })),
      '2026-07-31',
    );
    expect(result.ok).toBe(false);
    expect(result.problems.join('\n')).toMatch(/reachability analysis/);
  });

  it('does not demand one for high-severity dev tooling', () => {
    // A vulnerable devDependency is exposed to the person running the build and nobody else,
    // so holding it to the shipped-runtime bar would be ceremony rather than security.
    const result = evaluateAdvisories(
      vulnerability('high'),
      withEntry(waiver({ scope: 'dev', classification: 'dev-tooling' })),
      '2026-07-31',
    );
    expect(result.ok).toBe(true);
  });
});
