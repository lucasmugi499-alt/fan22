import { describe, expect, it } from 'vitest';
import {
  NO_DEPENDENCIES,
  decideLifecycleTransition,
  hardDeleteBlockers,
  isPubliclyVisible,
  type LifecycleDependencies,
  type LifecycleState,
} from './lifecycle';

const decide = decideLifecycleTransition;

describe('object lifecycle', () => {
  it('archives from any live state', () => {
    for (const state of ['draft', 'active', 'suspended'] as const) {
      expect(decide({ action: 'archive', state, dependencies: NO_DEPENDENCIES }))
        .toEqual({ ok: true, nextState: 'archived' });
    }
  });

  it('restores to suspended, never straight back to public', () => {
    // Archiving is usually a response to something being wrong. Landing in suspended forces
    // a second, deliberate activation once a human has actually looked at the object.
    const outcome = decide({ action: 'restore', state: 'archived', dependencies: NO_DEPENDENCIES });
    expect(outcome).toEqual({ ok: true, nextState: 'suspended' });
    expect(isPubliclyVisible('suspended')).toBe(false);
    expect(isPubliclyVisible('active')).toBe(true);
  });

  it('refuses transitions that do not exist', () => {
    expect(decide({ action: 'restore', state: 'active', dependencies: NO_DEPENDENCIES }))
      .toMatchObject({ ok: false });
    expect(decide({ action: 'suspend', state: 'archived', dependencies: NO_DEPENDENCIES }))
      .toMatchObject({ ok: false });
  });

  it('hard-deletes only a draft with nothing attached', () => {
    expect(decide({ action: 'hard_delete', state: 'draft', dependencies: NO_DEPENDENCIES }))
      .toEqual({ ok: true, nextState: 'archived' });
  });

  it('refuses hard delete for anything that ever became real', () => {
    for (const state of ['active', 'suspended', 'archived'] as LifecycleState[]) {
      const outcome = decide({ action: 'hard_delete', state, dependencies: NO_DEPENDENCIES });
      expect(outcome).toMatchObject({ ok: false });
      expect((outcome as { reason: string }).reason).toContain('Archive it instead');
    }
  });

  it.each([
    ['officialMatches', 'sporting record'],
    ['matches', 'match(es)'],
    ['athletes', 'athlete profile'],
    ['teams', 'team(s)'],
    ['payments', 'money is never orphaned'],
    ['auditEvents', 'beyond its creation'],
  ] as const)('refuses hard delete while %s exist', (key, phrase) => {
    const dependencies: LifecycleDependencies = { ...NO_DEPENDENCIES, [key]: 1 };
    const outcome = decide({ action: 'hard_delete', state: 'draft', dependencies });
    expect(outcome).toMatchObject({ ok: false });
    expect((outcome as { blockers: string[] }).blockers.join(' ')).toContain(phrase);
  });

  it('reports every blocker at once, not the first one found', () => {
    // An operator told only about matches would delete the matches, try again, and meet the
    // payments they were never shown.
    const blockers = hardDeleteBlockers('active', {
      officialMatches: 2, matches: 5, athletes: 11, teams: 3, payments: 4, auditEvents: 9,
    });
    expect(blockers).toHaveLength(7); // six dependencies plus the non-draft state
    expect(blockers.some((b) => b.includes('is active'))).toBe(true);
  });
});
