import { describe, expect, it, vi } from 'vitest';
import { emailConfigured, sendEmailWithResend } from './resend';

describe('Resend email transport', () => {
  it('reports not_configured without attempting a network request when secrets are missing', async () => {
    const fetcher = vi.fn();

    await expect(sendEmailWithResend({
      to: 'admin@example.com',
      subject: 'Invite',
      html: '<p>Invite</p>',
      text: 'Invite',
      idempotencyKey: 'invite-1',
    }, {}, fetcher as unknown as typeof fetch)).resolves.toMatchObject({
      status: 'not_configured',
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(emailConfigured({ RESEND_API_KEY: 're_test' } as NodeJS.ProcessEnv)).toBe(false);
  });

  it('sends the expected Resend request with idempotency and sender config', async () => {
    const fetcher = vi.fn(async () => Response.json({ id: 'email_123' }));

    const result = await sendEmailWithResend({
      to: 'admin@example.com',
      subject: 'Invite',
      html: '<p>Invite</p>',
      text: 'Invite',
      idempotencyKey: 'invite-1',
      tags: [{ name: 'category', value: 'team_invitation' }],
    }, {
      RESEND_API_KEY: 're_test',
      GOALPLACE_EMAIL_FROM: 'GoalPlace256 <team@goalplace256.com>',
      GOALPLACE_EMAIL_REPLY_TO: 'ops@goalplace256.com',
    } as NodeJS.ProcessEnv, fetcher as unknown as typeof fetch);

    expect(result).toEqual({ status: 'sent', id: 'email_123' });
    expect(fetcher).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        authorization: 'Bearer re_test',
        'content-type': 'application/json',
        'idempotency-key': 'invite-1',
      }),
    }));
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      from: 'GoalPlace256 <team@goalplace256.com>',
      to: ['admin@example.com'],
      subject: 'Invite',
      reply_to: 'ops@goalplace256.com',
      tags: [{ name: 'category', value: 'team_invitation' }],
    });
  });

  it('surfaces provider failures without leaking the API key', async () => {
    const fetcher = vi.fn(async () => Response.json({ error: { message: 'Invalid from address' } }, { status: 400 }));

    await expect(sendEmailWithResend({
      to: 'admin@example.com',
      subject: 'Invite',
      html: '<p>Invite</p>',
      text: 'Invite',
      idempotencyKey: 'invite-1',
    }, {
      RESEND_API_KEY: 're_secret_value',
      GOALPLACE_EMAIL_FROM: 'GoalPlace256 <team@goalplace256.com>',
    } as NodeJS.ProcessEnv, fetcher as unknown as typeof fetch)).resolves.toEqual({
      status: 'failed',
      error: 'Invalid from address',
    });
  });
});
