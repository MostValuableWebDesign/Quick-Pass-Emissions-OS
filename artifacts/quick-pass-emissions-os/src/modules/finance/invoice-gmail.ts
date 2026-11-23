import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type { ReplitConnectors } from "@replit/connectors-sdk";
import { invoiceIssuer } from "./invoice-document";
import { invoiceBccEmail } from "./invoice-email";
import { invoiceRecipientAddresses } from "./invoice-recipients";

type GmailMessageList = { messages?: { id?: string }[] };

function recipientMatchesHeader(value: string | undefined, target: string) {
  const addresses = value?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  try {
    return invoiceRecipientAddresses(target).every((recipient) =>
      addresses.some((address) => address.toLowerCase() === recipient),
    );
  } catch {
    return false;
  }
}

export async function findSentGmailMessage(connectors: ReplitConnectors, messageId: string) {
  const query = new URLSearchParams({
    q: `rfc822msgid:${messageId.replace(/[<>]/g, "")}`,
    labelIds: "SENT",
    maxResults: "1",
  });
  const response = await connectors.proxy(
    "google-mail",
    `/gmail/v1/users/me/messages?${query.toString()}`,
    { method: "GET" },
  );
  if (!response.ok) throw new Error("Could not check Gmail Sent for a duplicate invoice email.");
  const result = (await response.json()) as GmailMessageList;
  const exact = result.messages?.find((message) => message.id)?.id;
  if (exact) return exact;

  // Gmail can replace the supplied Message-ID. Match the uniquely numbered PDF
  // in Sent as well, so reconciliation never requires sending another email.
  const number = messageId.match(/^<([a-zA-Z0-9_-]+)@quickpassemissions\.com>$/)?.[1];
  if (!number) return null;
  const filename = `Quick-Pass-${number.toUpperCase()}.pdf`;
  const fallbackQuery = new URLSearchParams({
    q: `from:${invoiceIssuer.email} filename:"${filename}"`,
    labelIds: "SENT",
    maxResults: "20",
  });
  const fallback = await connectors.proxy(
    "google-mail",
    `/gmail/v1/users/me/messages?${fallbackQuery.toString()}`,
    { method: "GET" },
  );
  if (!fallback.ok) throw new Error("Could not check sent invoice attachments.");
  const candidates = (await fallback.json()) as GmailMessageList & { nextPageToken?: string };
  type Part = { filename?: string; parts?: Part[] };
  const hasInvoice = (part: Part): boolean =>
    part.filename === filename || !!part.parts?.some(hasInvoice);
  for (const candidate of candidates.messages ?? []) {
    if (!candidate.id) continue;
    const metadata = await connectors.proxy(
      "google-mail",
      `/gmail/v1/users/me/messages/${encodeURIComponent(candidate.id)}?format=full`,
      { method: "GET" },
    );
    if (!metadata.ok) throw new Error("Could not verify a sent invoice attachment.");
    const message = (await metadata.json()) as { labelIds?: string[]; payload?: Part };
    if (message.labelIds?.includes("SENT") && message.payload && hasInvoice(message.payload))
      return candidate.id;
  }
  if (candidates.nextPageToken) throw new Error("Too many sent invoice matches to verify safely.");
  return null;
}

/** Locate only this resend attempt; the invoice-number/PDF fallback would match the original email. */
export async function findSentGmailResendMessage(
  connectors: ReplitConnectors,
  input: { requestId: string; invoiceNumber: string; recipient: string; createdAt: Date },
) {
  const safeNumber = input.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `Quick-Pass-${safeNumber}.pdf`;
  const after = new Date(input.createdAt.getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "/");
  const recipients = invoiceRecipientAddresses(input.recipient);
  const query = new URLSearchParams({
    q: `from:${invoiceIssuer.email} to:${recipients[0]} filename:"${filename}" after:${after}`,
    labelIds: "SENT",
    maxResults: "100",
  });
  type Part = { filename?: string; parts?: Part[] };
  type FullMessage = {
    labelIds?: string[];
    payload?: { headers?: { name?: string; value?: string }[] } & Part;
  };
  for (let page = 0; page < 10; page++) {
    const response = await connectors.proxy(
      "google-mail",
      `/gmail/v1/users/me/messages?${query.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) throw new Error("Could not reconcile the invoice resend in Gmail Sent.");
    const results = (await response.json()) as GmailMessageList & { nextPageToken?: string };
    const containsInvoice = (part: Part): boolean =>
      part.filename === filename || !!part.parts?.some(containsInvoice);
    for (const candidate of results.messages ?? []) {
      if (!candidate.id) continue;
      const full = await connectors.proxy(
        "google-mail",
        `/gmail/v1/users/me/messages/${encodeURIComponent(candidate.id)}?format=full`,
        { method: "GET" },
      );
      if (!full.ok) throw new Error("Could not inspect a possible invoice resend in Gmail Sent.");
      const message = (await full.json()) as FullMessage;
      const headers = message.payload?.headers ?? [];
      const resendId = headers.find(
        (header) => header.name?.toLowerCase() === "x-quick-pass-resend-id",
      )?.value;
      const to = headers.find((header) => header.name?.toLowerCase() === "to")?.value;
      if (
        message.labelIds?.includes("SENT") &&
        resendId === input.requestId &&
        recipientMatchesHeader(to, input.recipient) &&
        message.payload &&
        containsInvoice(message.payload)
      )
        return candidate.id;
    }
    if (!results.nextPageToken) return null;
    query.set("pageToken", results.nextPageToken);
  }
  throw new Error("Too many Gmail Sent results to verify this invoice resend safely.");
}

function wrapBase64(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

export function invoiceGmailRawMessage(input: {
  to: string;
  subject: string;
  body: string;
  invoiceNumber: string;
  pdf: Uint8Array;
  includeBcc: boolean;
  resendRequestId?: string;
}) {
  if (/[\r\n]/.test(input.to)) throw new Error("Enter valid recipient email addresses.");
  const recipients = invoiceRecipientAddresses(input.to);
  const to = recipients.join(", ");
  const safeNumber = input.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `Quick-Pass-${safeNumber}.pdf`;
  const boundary = `qp-invoice-${randomUUID().replaceAll("-", "")}`;
  const messageId = input.resendRequestId
    ? invoiceGmailResendMessageId(input.invoiceNumber, input.resendRequestId)
    : invoiceGmailMessageId(input.invoiceNumber);
  const subject = Buffer.from(input.subject, "utf8").toString("base64");
  const textBody = wrapBase64(Buffer.from(input.body, "utf8").toString("base64"));
  const attachment = wrapBase64(Buffer.from(input.pdf).toString("base64"));
  const message = [
    `From: ${invoiceIssuer.name} <${invoiceIssuer.email}>`,
    `To: ${to}`,
    ...(input.includeBcc ? [`Bcc: ${invoiceBccEmail}`] : []),
    `Subject: =?UTF-8?B?${subject}?=`,
    `Message-ID: ${messageId}`,
    ...(input.resendRequestId ? [`X-Quick-Pass-Resend-ID: ${input.resendRequestId}`] : []),
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    textBody,
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${filename}"`,
    "",
    attachment,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return Buffer.from(message, "utf8").toString("base64url");
}

export function invoiceGmailResendMessageId(invoiceNumber: string, requestId: string) {
  const safeNumber = invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  return `<${safeNumber}.resend.${requestId.replaceAll("-", "")}@quickpassemissions.com>`;
}

export function invoiceGmailMessageId(invoiceNumber: string) {
  const safeNumber = invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  return `<${safeNumber}@quickpassemissions.com>`;
}
