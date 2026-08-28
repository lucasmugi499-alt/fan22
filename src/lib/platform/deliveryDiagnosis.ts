/**
 * Turning a provider's rejection into something an operator can act on.
 *
 * A failed invitation currently shows the provider's own sentence, which is honest and is the
 * right thing to keep on the record. It is not, on its own, useful to the person looking at
 * it: "verify a domain at resend.com/domains, and change the `from` address" reads like a
 * task, and the operator has no way to tell whether it is *their* task, whether the invitation
 * can be retried, or whether every invitation is failing for the same reason.
 *
 * So the provider text stays verbatim and this adds one line above it: what actually went
 * wrong, who fixes it, and whether resending will help. Nothing here rewrites or softens the
 * provider's message.
 */

export type DeliveryFaultOwner =
  /** Somebody with access to the platform's email configuration and DNS. */
  | 'platform_configuration'
  /** The address itself is wrong; the operator can correct it and resend. */
  | 'recipient_address'
  /** Transient. Resending is the right move. */
  | 'transient'
  /** Not recognised. The provider text is all we have. */
  | 'unknown';

export type DeliveryDiagnosis = {
  /** One sentence naming the real cause. */
  summary: string;
  owner: DeliveryFaultOwner;
  /** Whether resending this invitation unchanged could succeed. */
  retryable: boolean;
  /** The concrete next step, where there is one. */
  nextStep?: string;
};

/**
 * Reads a provider failure and says what it means.
 *
 * Matched on the provider's message rather than a status code because the codes are shared
 * across unrelated failures — a sandbox restriction and a malformed address both arrive as a
 * 403 — and the message is the only thing that distinguishes them.
 */
export function diagnoseDeliveryFailure(providerError: string | null | undefined): DeliveryDiagnosis {
  const message = (providerError ?? '').toLowerCase();

  if (!message.trim()) {
    return {
      summary: 'The provider rejected the message without saying why.',
      owner: 'unknown',
      retryable: true,
    };
  }

  /*
   * The sandbox sender. Resend's shared `onboarding@resend.dev` address can only ever reach
   * the account owner's own verified address, so every invitation to anybody else fails
   * identically. This is the single most likely cause of a league's invitations all failing at
   * once, and it is configuration rather than anything about the recipient.
   */
  if (message.includes('your own email address') || message.includes('verify a domain')) {
    return {
      summary:
        'Email is still sending from the provider\'s shared testing address, which can only '
        + 'deliver to the account owner. No invitation to anybody else will arrive until a '
        + 'sending domain is verified.',
      owner: 'platform_configuration',
      retryable: false,
      nextStep:
        'Verify a sending domain with the email provider, then set GOALPLACE_EMAIL_FROM to an '
        + 'address on that domain and redeploy. Resending before then will fail the same way.',
    };
  }

  if (message.includes('not configured') || message.includes('api key')) {
    return {
      summary: 'Email is not configured for this environment, so nothing was sent.',
      owner: 'platform_configuration',
      retryable: false,
      nextStep: 'Set the email API key and sending address for this environment, then resend.',
    };
  }

  if (message.includes('invalid') && message.includes('email')) {
    return {
      summary: 'The recipient address was rejected as invalid.',
      owner: 'recipient_address',
      retryable: true,
      nextStep: 'Correct the address on the invitation and send it again.',
    };
  }

  if (message.includes('rate limit') || message.includes('too many')) {
    return {
      summary: 'The provider is rate limiting this account.',
      owner: 'transient',
      retryable: true,
      nextStep: 'Wait a few minutes and resend.',
    };
  }

  if (message.includes('bounce') || message.includes('mailbox') || message.includes('does not exist')) {
    return {
      summary: 'The address exists but the mailbox refused the message.',
      owner: 'recipient_address',
      retryable: true,
      nextStep: 'Confirm the address with the recipient, then resend or try another channel.',
    };
  }

  return {
    summary: 'The provider rejected the message.',
    owner: 'unknown',
    retryable: true,
  };
}

/** Whether this failure will repeat for every recipient until somebody changes configuration. */
export function isEnvironmentWideFailure(diagnosis: DeliveryDiagnosis): boolean {
  return diagnosis.owner === 'platform_configuration';
}
