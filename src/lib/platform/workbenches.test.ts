import { describe, expect, it } from 'vitest';
import { PLATFORM_WORKBENCHES } from './workbenches';

describe('Platform entity workbenches', () => {
  it('gives each entity its own operational tabs and immutable-history tab', () => {
    expect(PLATFORM_WORKBENCHES.league.tabs.map((tab) => tab.id)).toEqual(['overview', 'seasons', 'teams', 'accountability', 'quality', 'incidents', 'history']);
    expect(PLATFORM_WORKBENCHES.team.tabs.map((tab) => tab.id)).toContain('roster');
    expect(PLATFORM_WORKBENCHES.athlete.tabs.map((tab) => tab.id)).toEqual(['record', 'persona', 'team', 'verification', 'payee', 'history']);
    expect(PLATFORM_WORKBENCHES.person.tabs.map((tab) => tab.id)).toContain('assignments');
    expect(PLATFORM_WORKBENCHES.match.tabs.map((tab) => tab.id)).toContain('provenance');
    for (const workbench of Object.values(PLATFORM_WORKBENCHES)) {
      expect(workbench.tabs.at(-1)?.id).toBe('history');
      expect(workbench.forbiddenActions.every((item) => item.alternative.length > 10)).toBe(true);
    }
  });
});
