import { z } from "zod";

function publicAppUrl() {
  let appUrl: string | null = null;
  try {
    const url = new URL(process.env.OWNER_SUMMARY_APP_URL ?? "");
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/"
    )
      appUrl = url.origin;
  } catch {
    /* Unconfigured. */
  }
  return appUrl;
}

/** Owner-only readiness metadata. Values of credentials and email addresses never leave the server. */
export function ownerEmailSetupStatus() {
  return {
    providerKeySet: Boolean(process.env.RESEND_API_KEY?.trim()),
    senderAddressFormatValid: z.email().safeParse(process.env.OWNER_SUMMARY_FROM_EMAIL?.trim())
      .success,
    publicHttpsUrlSet: Boolean(publicAppUrl()),
  };
}

/** Server configuration only. Never return this object to a page or client component. */
export function ownerEmailConfig() {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = z.email().safeParse(process.env.OWNER_SUMMARY_FROM_EMAIL?.trim());
  const appUrl = publicAppUrl();
  return key && from.success && appUrl ? { key, from: from.data, appUrl } : null;
}

export class EmailSendError extends Error {
  constructor(public readonly retryable: boolean) {
    super(
      retryable
        ? "Provider unavailable; retry uses the same delivery key."
        : "Provider rejected this email; check sender, recipient and provider settings.",
    );
  }
}

/** Provider acceptance is not confirmation of inbox delivery. No recipient/body/secret logging. */
export async function sendOwnerEmail(
  key: string,
  delivery: {
    id: string;
    fromEmail: string;
    toEmail: string;
    subject: string;
    html: string;
    text: string;
  },
  timeoutMs = 8000,
) {
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `owner-summary/${delivery.id}`,
      },
      body: JSON.stringify({
        from: delivery.fromEmail,
        to: [delivery.toEmail],
        subject: delivery.subject,
        html: delivery.html,
        text: delivery.text,
      }),
      signal: AbortSignal.timeout(Math.max(1, Math.min(8000, timeoutMs))),
      redirect: "error",
    });
  } catch {
    throw new EmailSendError(true);
  }
  if (!response.ok) throw new EmailSendError(response.status === 429 || response.status >= 500);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new EmailSendError(true);
  }
  const parsed = z.object({ id: z.string().min(1).max(200) }).safeParse(body);
  if (!parsed.success) throw new EmailSendError(true);
  return parsed.data.id;
}
