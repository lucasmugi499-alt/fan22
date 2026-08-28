import { sendEmailWithResend, type EmailDeliveryResult } from './resend';

export type AccessInvitationEmailInput = {
  to: string;
  inviteUrl: string;
  invitationId: string;
  leagueName: string;
  roleLabel: string;
  expiresAt: string;
  attemptId?: string;
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

export function renderAccessInvitationEmail(input: AccessInvitationEmailInput) {
  const leagueName = escapeHtml(input.leagueName);
  const roleLabel = escapeHtml(input.roleLabel);
  const inviteUrl = escapeHtml(input.inviteUrl);
  const expiry = escapeHtml(formatExpiry(input.expiresAt));
  const subject = `${input.leagueName.replace(/[<>]/g, '')} ${input.roleLabel} invitation`;
  const text = [
    `You have been invited as ${input.roleLabel} for ${input.leagueName}.`,
    '',
    `Accept your assignment: ${input.inviteUrl}`,
    `Expires: ${formatExpiry(input.expiresAt)} Africa/Kampala time`,
    '',
    'Use the email address that received this invitation and a dedicated Organization Operator account.',
  ].join('\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#07110d;color:#f5fff9;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" style="max-width:620px;border:1px solid #1f3b2d;border-radius:24px;background:#0d1913"><tr><td style="padding:24px"><div style="color:#00d084;font-size:12px;font-weight:800;text-transform:uppercase">GoalPlace256 operations</div><h1 style="font-size:32px;line-height:1.1">Run ${leagueName}.</h1><p style="color:#b9c8bf;line-height:1.6">You have been invited as <strong>${roleLabel}</strong>. This is a governed operating assignment.</p><a href="${inviteUrl}" style="display:block;margin-top:20px;padding:15px 18px;border-radius:999px;background:#00d084;color:#06100b;text-align:center;text-decoration:none;font-weight:900">Accept assignment</a><p style="color:#78a58c;font-size:12px;line-height:1.6">Expires ${expiry} Africa/Kampala time.</p><p style="color:#78a58c;font-size:12px;word-break:break-all">Fallback link: ${inviteUrl}</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

export async function sendAccessInvitationEmail(input: AccessInvitationEmailInput): Promise<EmailDeliveryResult> {
  const rendered = renderAccessInvitationEmail(input);
  return sendEmailWithResend({
    to: input.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: `access-invitation:${input.invitationId}:${input.attemptId ?? 'initial'}`,
    tags: [
      { name: 'category', value: 'access_invitation' },
      { name: 'invitation', value: input.invitationId.slice(0, 120) },
    ],
  });
}
