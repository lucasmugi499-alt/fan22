export type EmailDeliveryStatus = 'sent' | 'not_configured' | 'failed';

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  tags?: Array<{ name: string; value: string }>;
};

export type EmailDeliveryResult = {
  status: EmailDeliveryStatus;
  id?: string;
  error?: string;
};

type ResendResponse = {
  id?: string;
  message?: string;
  name?: string;
  error?: string | { message?: string; name?: string };
};

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function emailFrom(env: NodeJS.ProcessEnv) {
  return env.GOALPLACE_EMAIL_FROM ?? env.RESEND_FROM_EMAIL;
}

function replyTo(env: NodeJS.ProcessEnv) {
  return env.GOALPLACE_EMAIL_REPLY_TO ?? env.RESEND_REPLY_TO_EMAIL;
}

function errorMessage(body: ResendResponse) {
  if (typeof body.error === 'string') return body.error;
  return body.error?.message ?? body.message ?? body.name ?? 'Resend rejected the email request.';
}

export function emailConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.RESEND_API_KEY && emailFrom(env));
}

export async function sendEmailWithResend(
  input: SendEmailInput,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): Promise<EmailDeliveryResult> {
  const apiKey = env.RESEND_API_KEY;
  const from = emailFrom(env);
  if (!apiKey || !from) {
    return {
      status: 'not_configured',
      error: 'RESEND_API_KEY and GOALPLACE_EMAIL_FROM must be configured before email can be sent.',
    };
  }

  const response = await fetcher(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'idempotency-key': input.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(replyTo(env) ? { reply_to: replyTo(env) } : {}),
      ...(input.tags?.length ? { tags: input.tags } : {}),
    }),
  }).catch((error: unknown) => ({
    ok: false,
    json: async () => ({
      message: error instanceof Error ? error.message : 'Email network request failed.',
    }),
  } as Response));

  const body = await response.json().catch(() => ({})) as ResendResponse;
  if (!response.ok) {
    return { status: 'failed', error: errorMessage(body) };
  }

  return { status: 'sent', id: body.id };
}
