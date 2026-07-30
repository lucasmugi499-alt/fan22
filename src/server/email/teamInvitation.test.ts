import { describe, expect, it, vi } from 'vitest';
import { sendEmailWithResend } from './resend';
import { renderTeamInvitationEmail, sendTeamInvitationEmail } from './teamInvitation';

vi.mock('./resend', () => ({
  sendEmailWithResend: vi.fn(async () => ({ status: 'sent', id: 'email_123' })),
}));

const invitation = {
  to: 'captain@example.com',
  inviteUrl: 'https://goalplace256.com/invitations/team/invite_123?token=abc',
  assignmentId: 'invite_123',
  teamName: 'Ntungamo Falcons',
  leagueName: 'Western Region Football League',
  seasonName: '2026 Regular Season',
  inviterName: 'League Ops',
  expiresAt: '2026-08-01T10:00:00.000Z',
};

describe('team invitation email', () => {
  it('renders a sporty invitation with escaped HTML and a plain-text fallback', () => {
    const rendered = renderTeamInvitationEmail({
      ...invitation,
      teamName: 'Falcons <script>',
      leagueName: 'Western & Central',
    });

    expect(rendered.subject).toBe('Falcons <script> Team Admin invitation');
    expect(rendered.html).toContain('GoalPlace256 call-up');
    expect(rendered.html).toContain('Falcons &lt;script&gt;');
    expect(rendered.html).toContain('Western &amp; Central');
    expect(rendered.html).toContain(invitation.inviteUrl);
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.text).toContain('Accept your assignment: https://goalplace256.com/invitations/team/invite_123?token=abc');
    expect(rendered.text).toContain('Africa/Kampala time');
  });

  it('sends team invitations through Resend with stable idempotency and tags', async () => {
    await expect(sendTeamInvitationEmail(invitation)).resolves.toEqual({
      status: 'sent',
      id: 'email_123',
    });

    expect(sendEmailWithResend).toHaveBeenCalledWith(expect.objectContaining({
      to: 'captain@example.com',
      subject: 'Ntungamo Falcons Team Admin invitation',
      idempotencyKey: 'team-invitation:invite_123',
      tags: [
        { name: 'category', value: 'team_invitation' },
        { name: 'assignment', value: 'invite_123' },
      ],
    }));
  });
});
