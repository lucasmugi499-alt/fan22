import { describe, expect, it } from 'vitest';
import { assignmentKindForScope } from './assignmentSelection';

describe('assignmentKindForScope', () => {
  it('maps accepted invitation scopes to switchable workspace kinds', () => {
    expect(assignmentKindForScope('team')).toBe('team');
    expect(assignmentKindForScope('league')).toBe('league');
  });

  it('ignores scopes that do not drive the team or league workspace switcher', () => {
    expect(assignmentKindForScope('athlete')).toBeNull();
    expect(assignmentKindForScope('platform')).toBeNull();
    expect(assignmentKindForScope('organization')).toBeNull();
  });
});
