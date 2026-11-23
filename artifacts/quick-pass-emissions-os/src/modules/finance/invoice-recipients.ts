import { z } from "zod";

const emailAddress = z.string().trim().max(254).email().transform((value) => value.toLowerCase());

export function invoiceRecipientAddresses(value: string | string[]) {
  const candidates = Array.isArray(value) ? value : value.split(/[;,]/);
  const valid = z.array(emailAddress).min(1).max(20).parse(candidates.filter((item) => item.trim()));
  return [...new Set(valid)];
}

export function normalizeInvoiceRecipients(value: string | string[]) {
  return invoiceRecipientAddresses(value).join(", ");
}
