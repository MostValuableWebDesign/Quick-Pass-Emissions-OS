import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type { ReplitConnectors } from "@replit/connectors-sdk";
import { invoiceIssuer } from "./invoice-document";
import { invoiceBccEmail } from "./invoice-email";

type GmailMessageList = { messages?: { id?: string }[] };

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
  return result.messages?.find((message) => message.id)?.id ?? null;
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
}) {
  if (!input.to || /[\r\n]/.test(input.to)) throw new Error("Enter one valid recipient email.");
  const safeNumber = input.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `Quick-Pass-${safeNumber}.pdf`;
  const boundary = `qp-invoice-${randomUUID().replaceAll("-", "")}`;
  const messageId = invoiceGmailMessageId(input.invoiceNumber);
  const subject = Buffer.from(input.subject, "utf8").toString("base64");
  const textBody = wrapBase64(Buffer.from(input.body, "utf8").toString("base64"));
  const attachment = wrapBase64(Buffer.from(input.pdf).toString("base64"));
  const message = [
    `From: ${invoiceIssuer.name} <${invoiceIssuer.email}>`,
    `To: ${input.to}`,
    `Bcc: ${invoiceBccEmail}`,
    `Subject: =?UTF-8?B?${subject}?=`,
    `Message-ID: ${messageId}`,
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

export function invoiceGmailMessageId(invoiceNumber: string) {
  const safeNumber = invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  return `<${safeNumber}@quickpassemissions.com>`;
}
