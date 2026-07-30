import { sendEmailWithResend, type EmailDeliveryResult } from './resend';

export type TeamInvitationEmailInput = {
  to: string;
  inviteUrl: string;
  assignmentId: string;
  teamName: string;
  leagueName: string;
  seasonName: string;
  inviterName?: string;
  expiresAt: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatExpiry(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-UG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Kampala',
  }).format(date);
}

export function renderTeamInvitationEmail(input: TeamInvitationEmailInput) {
  const teamName = escapeHtml(input.teamName);
  const leagueName = escapeHtml(input.leagueName);
  const seasonName = escapeHtml(input.seasonName);
  const inviterName = escapeHtml(input.inviterName ?? 'your League Admin');
  const inviteUrl = escapeHtml(input.inviteUrl);
  const expiry = escapeHtml(formatExpiry(input.expiresAt));

  const subject = `${input.teamName} Team Admin invitation`;
  const htmlSubject = escapeHtml(subject);
  const text = [
    `You have been called up as Team Admin for ${teamName}.`,
    '',
    `League: ${leagueName}`,
    `Season: ${seasonName}`,
    `Sent by: ${inviterName}`,
    `Expires: ${expiry} Africa/Kampala time`,
    '',
    `Accept your assignment: ${input.inviteUrl}`,
    '',
    'Use the email address that received this invitation. GoalPlace256 will activate your Team Admin console after you accept.',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${htmlSubject}</title>
  </head>
  <body style="margin:0;background:#07110d;color:#f5fff9;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#07110d;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;overflow:hidden;border-radius:24px;background:#0d1913;border:1px solid #1f3b2d;">
            <tr>
              <td style="padding:22px 24px;border-bottom:1px solid #1f3b2d;background:#0b1510;">
                <div style="display:inline-block;border-radius:999px;background:#00d084;color:#06100b;padding:7px 12px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">GoalPlace256 call-up</div>
                <h1 style="margin:18px 0 0;font-size:34px;line-height:1.05;letter-spacing:-.02em;color:#f5fff9;">You are on the team sheet.</h1>
                <p style="margin:10px 0 0;color:#b9c8bf;font-size:15px;line-height:1.55;">${inviterName} invited you to run matchday operations for <strong style="color:#ffffff;">${teamName}</strong>.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;">
                  <tr>
                    <td style="padding:14px 16px;background:#101f18;border:1px solid #214431;border-radius:16px;">
                      <div style="font-size:12px;color:#78a58c;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Team</div>
                      <div style="margin-top:4px;font-size:20px;font-weight:800;color:#ffffff;">${teamName}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;background:#101f18;border:1px solid #214431;border-radius:16px;">
                      <div style="font-size:12px;color:#78a58c;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Competition</div>
                      <div style="margin-top:4px;font-size:16px;font-weight:700;color:#ffffff;">${leagueName} · ${seasonName}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;background:#101f18;border:1px solid #214431;border-radius:16px;">
                      <div style="font-size:12px;color:#78a58c;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Expires</div>
                      <div style="margin-top:4px;font-size:16px;font-weight:700;color:#ffffff;">${expiry} Africa/Kampala time</div>
                    </td>
                  </tr>
                </table>
                <a href="${inviteUrl}" style="display:block;margin:18px 0 0;background:#00d084;color:#06100b;text-decoration:none;text-align:center;border-radius:999px;padding:15px 18px;font-size:15px;font-weight:900;">Accept Team Admin assignment</a>
                <p style="margin:18px 0 0;color:#b9c8bf;font-size:13px;line-height:1.6;">Use the email address that received this invitation. After acceptance, GoalPlace256 opens your Team Admin console for roster, fixtures, field mode, and result confirmation.</p>
                <p style="margin:14px 0 0;color:#78a58c;font-size:12px;line-height:1.6;word-break:break-all;">Fallback link: <a href="${inviteUrl}" style="color:#00d084;">${inviteUrl}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px;background:#09130e;border-top:1px solid #1f3b2d;color:#78a58c;font-size:12px;line-height:1.5;">
                GoalPlace256 verifies community sport operations. If you were not expecting this invitation, ignore this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

export async function sendTeamInvitationEmail(input: TeamInvitationEmailInput): Promise<EmailDeliveryResult> {
  const rendered = renderTeamInvitationEmail(input);
  return sendEmailWithResend({
    to: input.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: `team-invitation:${input.assignmentId}`,
    tags: [
      { name: 'category', value: 'team_invitation' },
      { name: 'assignment', value: input.assignmentId.slice(0, 120) },
    ],
  });
}
