import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { invoiceIssuer } from "./invoice-document";

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
  const subject = Buffer.from(input.subject, "utf8").toString("base64");
  const textBody = wrapBase64(Buffer.from(input.body, "utf8").toString("base64"));
  const attachment = wrapBase64(Buffer.from(input.pdf).toString("base64"));
  const message = [
    `From: ${invoiceIssuer.name} <${invoiceIssuer.email}>`,
    `To: ${input.to}`,
    `Subject: =?UTF-8?B?${subject}?=`,
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
