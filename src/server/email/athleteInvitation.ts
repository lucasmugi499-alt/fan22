import { sendEmailWithResend, type EmailDeliveryResult } from './resend';

export type AthleteInvitationEmailInput = {
  to: string;
  inviteUrl: string;
  athleteName: string;
  teamName: string;
  inviterName?: string;
  expiresAt: string;
  athleteId: string;
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

export function renderAthleteInvitationEmail(input: AthleteInvitationEmailInput) {
  const athleteName = escapeHtml(input.athleteName);
  const teamName = escapeHtml(input.teamName);
  const inviterName = escapeHtml(input.inviterName ?? 'your Team Admin');
  const inviteUrl = escapeHtml(input.inviteUrl);
  const expiry = escapeHtml(formatExpiry(input.expiresAt));
  const subject = `${input.teamName} athlete account invitation`;
  const htmlSubject = escapeHtml(subject);
  const text = [
    `${inviterName} created your GoalPlace256 athlete profile for ${teamName}.`,
    '',
    `Athlete: ${input.athleteName}`,
    `Team: ${input.teamName}`,
    `Expires: ${expiry} Africa/Kampala time`,
    '',
    `Create or sign in to your athlete account: ${input.inviteUrl}`,
    '',
    'Use the email address that received this invitation. GoalPlace256 will send the profile to League verification before the account is linked.',
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
                <div style="display:inline-block;border-radius:999px;background:#00d084;color:#06100b;padding:7px 12px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">GoalPlace256 athlete invite</div>
                <h1 style="margin:18px 0 0;font-size:34px;line-height:1.05;color:#f5fff9;">Your verified career profile is ready.</h1>
                <p style="margin:10px 0 0;color:#b9c8bf;font-size:15px;line-height:1.55;">${inviterName} created a profile for <strong style="color:#ffffff;">${athleteName}</strong> at <strong style="color:#ffffff;">${teamName}</strong>.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0;color:#b9c8bf;font-size:14px;line-height:1.6;">Use the same email address that received this invitation. After you create or sign in to your account, the League Admin verifies the link before the profile becomes yours.</p>
                <a href="${inviteUrl}" style="display:block;margin:18px 0 0;background:#00d084;color:#06100b;text-decoration:none;text-align:center;border-radius:999px;padding:15px 18px;font-size:15px;font-weight:900;">Create athlete account</a>
                <p style="margin:18px 0 0;color:#78a58c;font-size:12px;line-height:1.6;">Expires: ${expiry} Africa/Kampala time</p>
                <p style="margin:14px 0 0;color:#78a58c;font-size:12px;line-height:1.6;word-break:break-all;">Fallback link: <a href="${inviteUrl}" style="color:#00d084;">${inviteUrl}</a></p>
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

export async function sendAthleteInvitationEmail(input: AthleteInvitationEmailInput): Promise<EmailDeliveryResult> {
  const rendered = renderAthleteInvitationEmail(input);
  return sendEmailWithResend({
    to: input.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: `athlete-invitation:${input.athleteId}`,
    tags: [
      { name: 'category', value: 'athlete_invitation' },
      { name: 'athlete', value: input.athleteId.slice(0, 120) },
    ],
  });
}
