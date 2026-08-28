import { describe, expect, it } from 'vitest';
import { buildConsequencePreview } from './consequencePreview';

describe('platform command consequence previews', () => {
  it('blocks ratification when the live operator conflict check is positive', () => {
    const preview = buildConsequencePreview({
      commandId: 'integrity.exception.ratify',
      targetId: 'exception_1',
      facts: {
        exists: true,
        status: 'open',
        updatedAt: '2026-08-27T12:00:00.000Z',
        conflictWithMatch: true,
      },
      now: new Date('2026-08-27T12:05:00.000Z'),
    });

    expect(preview.available).toBe(false);
    expect(preview.blockers).toContain('You are affiliated with a club in this match. Another unconflicted operator must decide.');
    expect(preview.changes).not.toContain(expect.stringMatching(/score|result/i));
    expect(preview.audit).toMatchObject({
      action: 'match_exception_ratified',
      targetCollection: 'matchOperationalExceptions',
      targetId: 'exception_1',
    });
  });

  it('turns live draft dependencies into an archive alternative', () => {
    const preview = buildConsequencePreview({
      commandId: 'network.draft.hard_delete',
      targetId: 'league_1',
      facts: {
        exists: true,
        status: 'draft',
        dependencyCounts: { teams: 3, seasons: 1 },
      },
    });

    expect(preview.available).toBe(false);
    expect(preview.disabledReason).toMatch(/archive/i);
    expect(preview.confirmationPhrase).toBe('DELETE DRAFT');
  });
});
