import { describe, expect, it } from 'vitest';
import { paymentTransition } from './paymentState';

describe('payment state transitions', () => {
  it('allows ordinary collection progress', () => {
    expect(paymentTransition('payment_pending', 'payment_processing')).toBe('apply');
    expect(paymentTransition('payment_processing', 'settled', true)).toBe('apply');
    expect(paymentTransition('payment_processing', 'failed', true)).toBe('apply');
  });

  it('makes a settled payment terminal', () => {
    expect(paymentTransition('settled', 'settled', true)).toBe('duplicate');
    expect(paymentTransition('settled', 'failed', true)).toBe('reject');
    expect(paymentTransition('settled', 'held_for_review', true)).toBe('reject');
  });

  it('only accepts a late settlement after status verification', () => {
    expect(paymentTransition('failed', 'settled')).toBe('reject');
    expect(paymentTransition('failed', 'settled', true)).toBe('apply');
  });
});
