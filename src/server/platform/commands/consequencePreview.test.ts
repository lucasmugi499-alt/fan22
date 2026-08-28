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

  it('shows a merge as movement plus preservation, never as a rewrite', () => {
    const preview = buildConsequencePreview({
      commandId: 'network.team.merge',
      targetId: 'team_dup',
      facts: {
        exists: true,
        status: 'active',
        mergeSurvivorName: 'Kampala United',
        mergeMoves: [
          { what: 'Roster members', count: 22 },
          { what: 'Scheduled fixtures', count: 3 },
        ],
        mergePreserved: [{ what: 'Official results', count: 12 }],
      },
      now: new Date('2026-08-28T12:00:00.000Z'),
    });

    expect(preview.available).toBe(true);
    expect(preview.changes).toContain('Move 22 roster members to Kampala United.');
    expect(preview.changes).toContain('Move 3 scheduled fixtures to Kampala United.');
    expect(preview.remains).toContain('12 official results stay attached to the absorbed record.');
    expect(preview.remains).toContain(
      'No official result is reattributed. A played match keeps the identity that played it.',
    );
    expect(preview.remains).toContain(
      'Nothing is deleted; the absorbed record stays readable through its merge pointer.',
    );
    expect(preview.reversibility).toContain('by hand');
    // Governed: the operator must type the phrase before it can run.
    expect(preview.confirmationPhrase).toBe('MERGE');
  });

  it('refuses to offer a runnable merge the planner already rejected', () => {
    const preview = buildConsequencePreview({
      commandId: 'network.athlete.merge',
      targetId: 'athlete_dup',
      facts: {
        exists: true,
        mergeRefusal: 'A record cannot be merged into itself.',
      },
      now: new Date('2026-08-28T12:00:00.000Z'),
    });

    expect(preview.available).toBe(false);
    expect(preview.blockers).toContain('A record cannot be merged into itself.');
  });
});