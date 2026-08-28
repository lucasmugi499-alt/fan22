import { describe, expect, it } from 'vitest';
import { diagnoseDeliveryFailure, isEnvironmentWideFailure } from './deliveryDiagnosis';

const SANDBOX = 'You can only send testing emails to your own email address '
  + '(owner@example.com). To send emails to other recipients, please verify a domain at '
  + 'resend.com/domains, and change the `from` address to an email using this domain.';

describe('delivery diagnosis', () => {
  it('recognises the shared sandbox sender as configuration, not a recipient problem', () => {
    const diagnosis = diagnoseDeliveryFailure(SANDBOX);
    expect(diagnosis.owner).toBe('platform_configuration');
    expect(diagnosis.retryable).toBe(false);
    expect(diagnosis.summary).toContain('shared testing address');
    expect(diagnosis.nextStep).toContain('GOALPLACE_EMAIL_FROM');
    expect(isEnvironmentWideFailure(diagnosis)).toBe(true);
  });

  it('does not offer a retry that would fail identically', () => {
    expect(diagnoseDeliveryFailure(SANDBOX).retryable).toBe(false);
    expect(diagnoseDeliveryFailure('Email is not configured').retryable).toBe(false);
  });

  it('separates a bad address from a broken environment', () => {
    const invalid = diagnoseDeliveryFailure('Invalid `to` email address');
    expect(invalid.owner).toBe('recipient_address');
    expect(invalid.retryable).toBe(true);
    expect(isEnvironmentWideFailure(invalid)).toBe(false);
  });

  it('treats rate limiting as transient and worth resending', () => {
    const limited = diagnoseDeliveryFailure('Too many requests, rate limit exceeded');
    expect(limited.owner).toBe('transient');
    expect(limited.retryable).toBe(true);
  });

  it('reads a refused mailbox as the recipient, not the platform', () => {
    const bounced = diagnoseDeliveryFailure('550 mailbox does not exist');
    expect(bounced.owner).toBe('recipient_address');
  });

  it('says plainly when it has nothing to add', () => {
    expect(diagnoseDeliveryFailure('').summary).toContain('without saying why');
    expect(diagnoseDeliveryFailure('kaboom').owner).toBe('unknown');
    expect(diagnoseDeliveryFailure(null).owner).toBe('unknown');
  });
});
