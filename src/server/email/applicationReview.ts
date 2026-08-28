import { sendEmailWithResend, type EmailDeliveryResult } from './resend';

export type ApplicationReviewEmailInput = {
  applicationId: string;
  attemptId: string;
  to: string;
  applicantName: string;
  leagueName: string;
  decision: 'request_information' | 'reject';
  missingFields?: string[];
  message: string;
};

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export async function sendApplicationReviewEmail(input: ApplicationReviewEmailInput): Promise<EmailDeliveryResult> {
  const asks = input.missingFields?.length ? `We still need: ${input.missingFields.join(', ')}.` : '';
  const subject = input.decision === 'request_information'
    ? `More information needed for ${input.leagueName}`
    : `Update on your ${input.leagueName} application`;
  const text = [`Hello ${input.applicantName},`, '', input.message, asks, '', 'GoalPlace256 Platform Operations'].filter(Boolean).join('\n');
  const html = `<!doctype html><html lang="en"><body style="font-family:Arial,Helvetica,sans-serif;background:#07110d;color:#f5fff9;padding:24px"><main style="max-width:620px;margin:auto;background:#0d1913;border:1px solid #1f3b2d;border-radius:20px;padding:24px"><p>Hello ${escapeHtml(input.applicantName)},</p><h1 style="font-size:28px">${escapeHtml(subject)}</h1><p style="color:#b9c8bf;line-height:1.6">${escapeHtml(input.message)}</p>${asks ? `<p style="color:#00d084;line-height:1.6">${escapeHtml(asks)}</p>` : ''}<p style="color:#78a58c">GoalPlace256 Platform Operations</p></main></body></html>`;
  return sendEmailWithResend({
    to: input.to,
    subject,
    text,
    html,
    idempotencyKey: `application-review:${input.applicationId}:${input.attemptId}`,
    tags: [
      { name: 'category', value: 'application_review' },
      { name: 'application', value: input.applicationId.slice(0, 120) },
    ],
  });
}
