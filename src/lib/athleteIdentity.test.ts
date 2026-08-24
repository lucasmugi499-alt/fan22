import { describe, expect, it } from 'vitest';
import {
  athleteLegalName,
  athleteRegisteredPosition,
  normalizeAthleteIdentities,
  normalizeAthleteIdentity,
} from './athleteIdentity';

describe('athlete identity survives the rename', () => {
  it('reads a document written before ADR-001', () => {
    const legacy = { name: 'Emmanuel Okello', position: 'Forward' };

    expect(athleteLegalName(legacy)).toBe('Emmanuel Okello');
    expect(athleteRegisteredPosition(legacy)).toBe('Forward');
  });

  it('reads a document written after it', () => {
    const current = { legalName: 'Emmanuel Okello', registeredPosition: 'Forward' };

    expect(athleteLegalName(current)).toBe('Emmanuel Okello');
    expect(athleteRegisteredPosition(current)).toBe('Forward');
  });

  it('prefers the canonical field when a document carries both', () => {
    // Mid-migration a document can hold both. The canonical field is the one the League last
    // wrote, so a stale legacy copy must never win.
    const both = { legalName: 'Emmanuel Okello', name: 'E. Okello', registeredPosition: 'Forward', position: 'Winger' };

    expect(athleteLegalName(both)).toBe('Emmanuel Okello');
    expect(athleteRegisteredPosition(both)).toBe('Forward');
  });

  it('returns an empty string rather than undefined for a record carrying neither', () => {
    // Callers render this straight into a label. `undefined` reaches a screen as the word
    // "undefined"; an empty string reaches it as nothing, which is the honest answer.
    expect(athleteLegalName({})).toBe('');
    expect(athleteLegalName(undefined)).toBe('');
    expect(athleteRegisteredPosition(undefined)).toBe('');
  });

  it('fills the canonical fields at the boundary without stripping the legacy ones', () => {
    // The legacy keys stay on the object during the migration so a surface that still reads
    // one keeps working. The guard is what stops new readers appearing, not deletion.
    const normalized = normalizeAthleteIdentity({ name: 'Emmanuel Okello', position: 'Forward' });

    expect(normalized).toMatchObject({
      legalName: 'Emmanuel Okello',
      registeredPosition: 'Forward',
      name: 'Emmanuel Okello',
      position: 'Forward',
    });
  });

  it('returns the same object when there is nothing to normalize', () => {
    // Identity rather than a copy, so normalizing a large collection on every read does not
    // allocate a thousand new objects for no reason.
    const already = { legalName: 'Emmanuel Okello', registeredPosition: 'Forward' };

    expect(normalizeAthleteIdentity(already)).toBe(already);
  });

  it('normalizes a collection', () => {
    expect(normalizeAthleteIdentities([{ name: 'A', position: 'Lock' }, { legalName: 'B', registeredPosition: 'Prop' }]))
      .toEqual([
        { name: 'A', position: 'Lock', legalName: 'A', registeredPosition: 'Lock' },
        { legalName: 'B', registeredPosition: 'Prop' },
      ]);
  });
});
