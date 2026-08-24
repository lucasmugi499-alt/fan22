import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAPTURE_POLICY,
  effectiveCapturePolicy,
  permitsPostMatchEntry,
  qualityCeilingFor,
  requiresFallbackReason,
} from './capturePolicy';

describe('capture policy is a property of the competition', () => {
  it('takes the stronger of what the league asked for and what platform requires', () => {
    expect(effectiveCapturePolicy('POST_MATCH_ALLOWED', 'FIELD_REQUIRED')).toBe('FIELD_REQUIRED');
    expect(effectiveCapturePolicy('FIELD_REQUIRED', 'POST_MATCH_ALLOWED')).toBe('FIELD_REQUIRED');
    expect(effectiveCapturePolicy('FIELD_PREFERRED', 'POST_MATCH_ALLOWED')).toBe('FIELD_PREFERRED');
  });

  it('never lets a platform floor weaken a league that opted into rigour', () => {
    // The floor is a minimum, not an override. A platform default must not quietly downgrade
    // a competition whose league deliberately required field capture.
    expect(effectiveCapturePolicy('FIELD_REQUIRED', 'FIELD_PREFERRED')).toBe('FIELD_REQUIRED');
  });

  it('falls back to the weakest policy for unrecognised input rather than throwing', () => {
    // A fixture created before this field existed has no policy. Refusing to resolve one
    // would make historical fixtures unreadable; defaulting to the permissive end matches
    // how they were actually created.
    expect(effectiveCapturePolicy(undefined, undefined)).toBe(DEFAULT_CAPTURE_POLICY);
    expect(effectiveCapturePolicy('NONSENSE', null)).toBe('POST_MATCH_ALLOWED');
  });

  it('refuses post-match entry only where field capture is required', () => {
    expect(permitsPostMatchEntry('POST_MATCH_ALLOWED')).toBe(true);
    expect(permitsPostMatchEntry('FIELD_PREFERRED')).toBe(true);
    expect(permitsPostMatchEntry('FIELD_REQUIRED')).toBe(false);
  });

  it('asks for a reason only where a fallback is an exception', () => {
    expect(requiresFallbackReason('FIELD_PREFERRED')).toBe(true);
    expect(requiresFallbackReason('POST_MATCH_ALLOWED')).toBe(false);
  });

  it('caps quality at bronze wherever a typed score is permitted', () => {
    expect(qualityCeilingFor('FIELD_REQUIRED')).toBe('gold');
    expect(qualityCeilingFor('FIELD_PREFERRED')).toBe('bronze');
    expect(qualityCeilingFor('POST_MATCH_ALLOWED')).toBe('bronze');
  });
});
