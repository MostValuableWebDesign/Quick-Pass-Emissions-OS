"use server";

import { ReplitConnectors } from "@replit/connectors-sdk";
import { z } from "zod";
import { currentUser } from "@/lib/access";
import { businessDate } from "@/lib/time";
import { invoiceDetail } from "@/modules/finance/service";
import { receivable } from "@/modules/finance/rules";
import { invoiceSnapshotSchema, invoiceIssuer } from "@/modules/finance/invoice-document";
import { createInvoicePdf } from "@/modules/finance/invoice-pdf";
import { buildInvoiceEmail } from "@/modules/finance/invoice-email";
import { invoiceGmailRawMessage } from "@/modules/finance/invoice-gmail";

export type InvoiceGmailDraftState = {
  ok: boolean;
  message: string;
  draftsUrl?: string;
};

const requestSchema = z.object({
  invoiceId: z.string().trim().min(1).max(64),
  recipient: z.email().max(254),
  contactName: z.string().trim().min(1).max(160),
  paymentInstructions: z.string().trim().min(1).max(500),
  senderName: z.string().trim().min(1).max(160),
  senderPhone: z.string().trim().max(50).default(""),
});

export async function createInvoiceGmailDraft(
  _previous: InvoiceGmailDraftState | null,
  formData: FormData,
): Promise<InvoiceGmailDraftState> {
  const parsed = requestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the invoice email details.",
    };
  }

  try {
    const actor = await currentUser();
    const data = parsed.data;
    const detail = await invoiceDetail(actor.id, data.invoiceId);
    const invoice = detail.invoice;
    if (!invoice) return { ok: false, message: "Invoice not found." };
    if (invoice.state === "VOIDED")
      return { ok: false, message: "A voided invoice cannot be emailed." };

    const balance = receivable(
      { ...invoice, state: invoice.approvedAt ? invoice.state : "DRAFT" },
      invoice.payments,
      businessDate(),
    );
    const remainingCents =
      invoice.state === "DRAFT"
        ? Math.max(0, invoice.totalCents - balance.paidCents)
        : balance.remainingCents;
    if (remainingCents <= 0)
      return { ok: false, message: "Only invoices with an unpaid balance can be emailed." };

    const connectors = new ReplitConnectors();
    const profileResponse = await connectors.proxy(
      "google-mail",
      "/gmail/v1/users/me/profile",
      { method: "GET" },
    );
    if (!profileResponse.ok)
      return { ok: false, message: "Unable to verify the connected Gmail account." };
    const profile = (await profileResponse.json()) as { emailAddress?: string };
    if (profile.emailAddress?.toLowerCase() !== invoiceIssuer.email)
      return {
        ok: false,
        message: "Connect Gmail as qpemissions@gmail.com before creating invoice drafts.",
      };

    const snapshot = invoiceSnapshotSchema.parse(invoice.snapshot);
    const email = buildInvoiceEmail(
      {
        number: invoice.number,
        dealershipName: snapshot.name,
        dueDate: invoice.dueDate,
        serviceDates: invoice.lines.map((line) => line.date),
        remainingCents,
      },
      {
        ...data,
        senderEmail: invoiceIssuer.email,
      },
    );
    const pdf = await createInvoicePdf({
      ...invoice,
      status: balance.status,
      snapshot,
      demo: detail.demo,
      paidCents: balance.paidCents,
      remainingCents,
    });
    const raw = invoiceGmailRawMessage({
      to: data.recipient,
      subject: email.subject,
      body: email.body,
      invoiceNumber: invoice.number,
      pdf,
    });

    let draftResponse: Response;
    try {
      draftResponse = await connectors.proxy(
        "google-mail",
        "/gmail/v1/users/me/drafts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: { raw } }),
        },
      );
    } catch {
      return {
        ok: false,
        message:
          "Gmail did not confirm the draft. Check Gmail Drafts before retrying; a draft may already exist. No email was sent.",
      };
    }

    if (!draftResponse.ok)
      return {
        ok: false,
        message:
          "Gmail could not create the draft. No email was sent. Check the Gmail connection and try again.",
      };
    const created = (await draftResponse.json()) as { id?: string };
    if (!created.id)
      return {
        ok: false,
        message:
          "Gmail may have created the draft, but did not confirm it. Check Gmail Drafts before retrying. No email was sent.",
      };

    return {
      ok: true,
      message: "Gmail draft created with the invoice PDF attached. Review it in Gmail and send when ready.",
      draftsUrl: "https://mail.google.com/mail/u/0/#drafts",
    };
  } catch {
    return {
      ok: false,
      message: "Unable to create the Gmail draft. No email was sent.",
    };
  }
}
