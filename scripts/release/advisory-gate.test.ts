import { describe, expect, it } from 'vitest';
import { evaluateAdvisories } from './advisory-gate';

const register = {
  reviewedAt: '2026-07-30',
  entries: [
    {
      package: 'next',
      severity: 'high' as const,
      scope: 'runtime-build',
      status: 'accepted-temporarily' as const,
      reason: 'Current upstream version has no safe patched replacement.',
      mitigation: 'No untrusted CSS is processed at runtime.',
      expiresOn: '2026-08-30',
    },
    {
      package: '*',
      packages: ['glob'],
      severity: 'high' as const,
      scope: 'dev-tooling',
      status: 'accepted-temporarily' as const,
      reason: 'Development-only tooling chain.',
      mitigation: 'No production runtime exposure.',
      expiresOn: '2026-08-30',
    },
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
