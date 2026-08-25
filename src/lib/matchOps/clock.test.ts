import { describe, expect, it } from 'vitest';
import { applyClockAction, gameClockMs, hasClockAnomaly, initialClockState } from './clock';

const T0 = new Date('2026-08-24T15:00:00.000Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1_000);

function started() {
  const initial = initialClockState('match_1', 1, T0.toISOString());
  const result = applyClockAction(initial, { type: 'start' }, T0);
  if (!result.ok) throw new Error(result.reason);
  return result.next;
}

describe('the match clock is derived from anchors', () => {
  it('counts from the anchor while running', () => {
    expect(gameClockMs(started(), at(90))).toBe(90_000);
  });

  /**
   * The property the whole design exists for. A timer would have died when the phone locked;
   * the anchor does not care that nothing was running, because nothing needed to be.
   */
  it('reconstructs the same time after the app was closed for the whole period', () => {
    const clock = started();

    // No ticks happened. The phone was asleep in somebody's pocket for eleven minutes.
    expect(gameClockMs(clock, at(660))).toBe(660_000);
  });

  it('banks time when paused, so a pause through a lost connection loses nothing', () => {
    const paused = applyClockAction(started(), { type: 'pause' }, at(120));
    if (!paused.ok) throw new Error(paused.reason);

    expect(paused.next.accumulatedMs).toBe(120_000);
    // Time no longer advances while paused, however long the gap.
    expect(gameClockMs(paused.next, at(900))).toBe(120_000);
  });

  it('continues from banked time on resume', () => {
    const paused = applyClockAction(started(), { type: 'pause' }, at(120));
    if (!paused.ok) throw new Error(paused.reason);
    const resumed = applyClockAction(paused.next, { type: 'resume' }, at(200));
    if (!resumed.ok) throw new Error(resumed.reason);

    expect(gameClockMs(resumed.next, at(230))).toBe(150_000);
  });

  it('starts the second period from zero', () => {
    const half = applyClockAction(started(), { type: 'end_period' }, at(2_700));
    if (!half.ok) throw new Error(half.reason);
    expect(half.next.accumulatedMs).toBe(2_700_000);

    const second = applyClockAction(half.next, { type: 'start_period', period: '2' }, at(3_600));
    if (!second.ok) throw new Error(second.reason);

    expect(second.next.period).toBe('2');
    expect(gameClockMs(second.next, at(3_630))).toBe(30_000);
  });

  it('records an adjustment with its reason instead of moving the clock silently', () => {
    const adjusted = applyClockAction(
      started(),
      { type: 'adjust', deltaMs: 30_000, reason: 'Started timer late' },
      at(60),
    );
    if (!adjusted.ok) throw new Error(adjusted.reason);

    expect(adjusted.next.adjustments).toEqual([
      { deltaMs: 30_000, reason: 'Started timer late', at: at(60).toISOString() },
    ]);
    expect(gameClockMs(adjusted.next, at(60))).toBe(90_000);
  });

  it('re-anchors on adjustment, so a running clock does not re-add what it just adjusted', () => {
    const adjusted = applyClockAction(
      started(),
      { type: 'adjust', deltaMs: 30_000, reason: 'Started timer late' },
      at(60),
    );
    if (!adjusted.ok) throw new Error(adjusted.reason);

    // Ten more seconds of real time, ten more seconds on the clock. Not seventy.
    expect(gameClockMs(adjusted.next, at(70))).toBe(100_000);
  });

  it('refuses an adjustment with no reason', () => {
    expect(applyClockAction(started(), { type: 'adjust', deltaMs: 1_000, reason: '  ' }, at(10)))
      .toEqual({ ok: false, reason: 'An adjustment needs a reason.' });
  });

  it('refuses an adjustment that would take the clock below zero', () => {
    expect(applyClockAction(started(), { type: 'adjust', deltaMs: -60_000, reason: 'Too early' }, at(10)).ok)
      .toBe(false);
  });

  it('refuses transitions that make no sense from the current state', () => {
    expect(applyClockAction(started(), { type: 'start' }, at(10)).ok).toBe(false);
    expect(applyClockAction(started(), { type: 'resume' }, at(10)).ok).toBe(false);
    const initial = initialClockState('match_1', 1, T0.toISOString());
    expect(applyClockAction(initial, { type: 'pause' }, at(10)).ok).toBe(false);
  });

  it('increments the version on every transition, so a stale writer loses', () => {
    const clock = started();
    const paused = applyClockAction(clock, { type: 'pause' }, at(60));
    if (!paused.ok) throw new Error(paused.reason);

    expect(paused.next.version).toBe(clock.version + 1);
  });

  it('flags an anomaly on repeated or large adjustments, without blocking anything', () => {
    expect(hasClockAnomaly({ adjustments: [{ deltaMs: 30_000, reason: 'late', at: '' }] })).toBe(false);
    expect(hasClockAnomaly({
      adjustments: [
        { deltaMs: 30_000, reason: 'late', at: '' },
        { deltaMs: 10_000, reason: 'late again', at: '' },
      ],
    })).toBe(true);
    expect(hasClockAnomaly({ adjustments: [{ deltaMs: 150_000, reason: 'very late', at: '' }] })).toBe(true);
  });
});
