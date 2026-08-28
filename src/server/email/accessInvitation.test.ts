import { describe, expect, it, vi } from 'vitest';
import { sendEmailWithResend } from './resend';
import { renderAccessInvitationEmail, sendAccessInvitationEmail } from './accessInvitation';

vi.mock('./resend', () => ({
  sendEmailWithResend: vi.fn(async () => ({ status: 'sent', id: 'email_123' })),
}));

describe('access invitation email', () => {
  it('renders the league, role and expiry without unsafe HTML', () => {
    const rendered = renderAccessInvitationEmail({
      to: 'owner@example.com',
      inviteUrl: 'https://goalplace256.test/invitations/access/invite_1?token=secret',
      invitationId: 'invite_1',
      leagueName: '<Kampala League>',
      roleLabel: 'League Owner',
      expiresAt: '2026-09-03T12:00:00.000Z',
    });

    expect(rendered.subject).toContain('Kampala League');
    expect(rendered.html).toContain('&lt;Kampala League&gt;');
    expect(rendered.html).not.toContain('<Kampala League>');
  });

  it('uses attempt-specific idempotency for observable resend attempts', async () => {
    await sendAccessInvitationEmail({
      to: 'owner@example.com',
      inviteUrl: 'https://goalplace256.test/invitations/access/invite_1?token=secret',
      invitationId: 'invite_1',
      leagueName: 'Kampala League',
      roleLabel: 'League Owner',
      expiresAt: '2026-09-03T12:00:00.000Z',
      attemptId: 'attempt_2',
    });

    expect(sendEmailWithResend).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'access-invitation:invite_1:attempt_2',
    }));
  });
});
