import { describe, expect, it } from 'vitest';
import { postMatchEntryRefusal } from './route';

const NOW = Date.parse('2026-09-21T12:00:00.000Z');

describe('post-match entry refusals', () => {
  it('accepts a played fixture nobody recorded', () => {
    expect(postMatchEntryRefusal({ status: 'scheduled', scheduledAt: '2026-09-19T15:00:00.000Z', verificationStatus: 'pending' }, NOW))
      .toBeNull();
  });

  it('accepts a live match whose capture stalled', () => {
    expect(postMatchEntryRefusal({ status: 'live', scheduledAt: '2026-09-21T10:00:00.000Z', verificationStatus: 'pending' }, NOW))
      .toBeNull();
  });

  it('refuses a fixture that has not kicked off', () => {
    expect(postMatchEntryRefusal({ status: 'scheduled', scheduledAt: '2026-09-28T15:00:00.000Z', verificationStatus: 'pending' }, NOW))
      .toMatch(/not been played/);
  });

  it('refuses a fixture recorded as not played', () => {
    expect(postMatchEntryRefusal({ status: 'cancelled', scheduledAt: '2026-09-19T15:00:00.000Z', verificationStatus: 'pending' }, NOW))
      .toMatch(/not played/);
  });

  it('refuses an official result, pointing at the one door that corrects it', () => {
    // The failure this guards: a second path that can put a score on an official match.
    expect(postMatchEntryRefusal({ status: 'completed', scheduledAt: '2026-09-19T15:00:00.000Z', verificationStatus: 'verified' }, NOW))
      .toMatch(/result case/);
  });

  it('refuses a result already awaiting verification', () => {
    expect(postMatchEntryRefusal({ status: 'completed', scheduledAt: '2026-09-19T15:00:00.000Z', verificationStatus: 'pending' }, NOW))
      .toMatch(/awaiting verification/);
  });
});
