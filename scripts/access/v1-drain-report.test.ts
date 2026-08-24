import { describe, expect, it } from 'vitest';
import { buildDrainReport } from './v1-drain-report';

describe('V1 drain report', () => {
  it('counts submissions the rebuild would strand', () => {
    const report = buildDrainReport([
      { id: 'm1', status: 'pending_confirmation', leagueId: 'league_1' },
      { id: 'm2', status: 'confirmation_overdue', leagueId: 'league_1' },
      { id: 'm3', status: 'official', leagueId: 'league_1' },
    ]);

    expect(report.strandedByRebuild.map((row) => row.id)).toEqual(['m1', 'm2']);
    expect(report.byLeague).toEqual({ league_1: 2 });
    expect(report.safeToRebuild).toBe(false);
  });

  it('does not block on submissions the league can already resolve', () => {
    // A disputed claim is the league's to settle and league capability is untouched by the
    // rebuild. Blocking on these would make the gate unreachable in any league with a live
    // dispute, which is most of them.
    const report = buildDrainReport([
      { id: 'm1', status: 'disputed', leagueId: 'league_1' },
      { id: 'm2', status: 'confirmed', leagueId: 'league_1' },
    ]);

    expect(report.leagueResolvable).toHaveLength(2);
    expect(report.strandedByRebuild).toEqual([]);
    expect(report.safeToRebuild).toBe(true);
  });

  it('is safe when nothing is awaiting a team', () => {
    expect(buildDrainReport([{ id: 'm1', status: 'official' }]).safeToRebuild).toBe(true);
    expect(buildDrainReport([]).safeToRebuild).toBe(true);
  });

  it('groups by league so the operator knows who to call', () => {
    const report = buildDrainReport([
      { id: 'm1', status: 'pending_confirmation', leagueId: 'league_1' },
      { id: 'm2', status: 'pending_confirmation', leagueId: 'league_2' },
      { id: 'm3', status: 'pending_confirmation', leagueId: 'league_2' },
    ]);

    expect(report.byLeague).toEqual({ league_1: 1, league_2: 2 });
  });
});
