import { describe, expect, it } from 'vitest';
import { planAthleteIdentityMigration } from './migrate-athlete-identity';

describe('athlete identity migration plan', () => {
  it('targets documents carrying only the legacy fields', () => {
    const plan = planAthleteIdentityMigration([
      { id: 'a1', name: 'Emmanuel Okello', position: 'Forward' },
      { id: 'a2', legalName: 'Musa Kato', registeredPosition: 'Lock' },
    ]);

    expect(plan.needsLegalName.map((row) => row.id)).toEqual(['a1']);
    expect(plan.needsRegisteredPosition.map((row) => row.id)).toEqual(['a1']);
  });

  it('never overwrites a canonical field that is already set', () => {
    // The canonical field is what the League last wrote. A stale legacy copy must not win,
    // and a migration that clobbers current data with older data is worse than no migration.
    const plan = planAthleteIdentityMigration([
      { id: 'a1', legalName: 'Emmanuel Okello', name: 'E. Okello', registeredPosition: 'Forward', position: 'Winger' },
    ]);

    expect(plan.needsLegalName).toEqual([]);
    expect(plan.needsRegisteredPosition).toEqual([]);
  });

  it('separates documents it cannot resolve rather than inventing a name', () => {
    const plan = planAthleteIdentityMigration([{ id: 'a1', position: 'Forward' }]);

    expect(plan.unresolvable.map((row) => row.id)).toEqual(['a1']);
    expect(plan.needsLegalName).toEqual([]);
    // The position is still repairable even when the name is not: they are separate fields
    // and a partial repair beats refusing the whole document.
    expect(plan.needsRegisteredPosition.map((row) => row.id)).toEqual(['a1']);
  });
});
