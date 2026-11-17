"use server";

import { ReplitConnectors } from "@replit/connectors-sdk";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/access";
import { businessDate } from "@/lib/time";
import * as finance from "@/modules/finance/service";
import { receivable } from "@/modules/finance/rules";
import { invoiceSnapshotSchema, invoiceIssuer } from "@/modules/finance/invoice-document";
import { createInvoicePdf } from "@/modules/finance/invoice-pdf";
import { buildInvoiceEmail } from "@/modules/finance/invoice-email";
import {
  findSentGmailMessage,
  invoiceGmailMessageId,
  invoiceGmailRawMessage,
} from "@/modules/finance/invoice-gmail";

export type InvoiceGmailSendState = {
  ok: boolean;
  message: string;
  sent?: boolean;
  uncertain?: boolean;
};

const requestSchema = z.object({
  invoiceId: z.string().trim().min(1).max(64),
  recipient: z.email().max(254),
  contactName: z.string().trim().min(1).max(160),
  paymentInstructions: z.string().trim().min(1).max(500),
  senderName: z.string().trim().max(160).default(""),
  senderPhone: z.string().trim().max(50).default(""),
  includeBcc: z
    .literal("on")
    .optional()
    .transform((value) => value === "on"),
});

type GmailMessageMetadata = { payload?: { headers?: { name?: string; value?: string }[] } };

function recipientMatchesHeader(value: string | undefined, target: string) {
  const addresses = value?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return addresses.some((address) => address.toLowerCase() === target.toLowerCase());
}

async function sentRecipientMatches(
  connectors: ReplitConnectors,
  messageId: string,
  target: string,
) {
  const response = await connectors.proxy(
    "google-mail",
    `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=To`,
    { method: "GET" },
  );
  if (!response.ok) return false;
  const result = (await response.json()) as GmailMessageMetadata;
  const toHeader = result.payload?.headers?.find(
    (header) => header.name?.toLowerCase() === "to",
  )?.value;
  return recipientMatchesHeader(toHeader, target);
}

async function markInvoiceSent(
  actorId: string,
  invoiceId: string,
  messageId: string,
  date: string,
) {
  const reference = `GMAIL:${messageId}`;
  const latest = await finance.invoiceDetail(actorId, invoiceId);
  if (!latest.invoice) throw new Error("Invoice not found.");
  if (latest.invoice.state === "SENT" && latest.invoice.deliveryReference === reference) return;
  await finance.recordGmailInvoiceSent(actorId, {
    id: invoiceId,
    version: latest.invoice.version,
    date,
    reference,
  });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/dealerships");
  revalidatePath(`/dealerships/${latest.invoice.dealershipId}`);
}

export async function sendInvoiceFromGmail(
  _previous: InvoiceGmailSendState | null,
  formData: FormData,
): Promise<InvoiceGmailSendState> {
  const parsed = requestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the invoice email details.",
    };
  }

  const actor = await currentUser();
  const data = parsed.data;
  const sendDate = businessDate();
  try {
    const detail = await finance.invoiceDetail(actor.id, data.invoiceId);
    const invoice = detail.invoice;
    if (!invoice) return { ok: false, message: "Invoice not found." };
    if (invoice.archivedAt)
      return {
        ok: false,
        message: "Restore this archived invoice before sending it.",
      };
    if (invoice.state === "SENT")
      return { ok: true, sent: true, message: "This invoice has already been sent." };
    if (invoice.state === "VOIDED")
      return { ok: false, message: "A voided invoice cannot be sent." };

    const balance = receivable(
      { ...invoice, state: invoice.approvedAt ? invoice.state : "DRAFT" },
      invoice.payments,
      sendDate,
    );
    const remainingCents =
      invoice.state === "DRAFT"
        ? Math.max(0, invoice.totalCents - balance.paidCents)
        : balance.remainingCents;
    if (remainingCents <= 0)
      return { ok: false, message: "Only invoices with an unpaid balance can be sent." };
    if (invoice.payments.some((payment) => payment.date < sendDate))
      return {
        ok: false,
        message: "A payment is dated before today. Review the invoice history before sending.",
      };

    const connectors = new ReplitConnectors();
    const profileResponse = await connectors.proxy("google-mail", "/gmail/v1/users/me/profile", {
      method: "GET",
    });
    if (!profileResponse.ok)
      return { ok: false, message: "Unable to verify the connected Gmail account." };
    const profile = (await profileResponse.json()) as { emailAddress?: string };
    if (profile.emailAddress?.toLowerCase() !== invoiceIssuer.email)
      return {
        ok: false,
        message: "Connect Gmail as qpemissions@gmail.com before sending invoices.",
      };

    const stableMessageId = invoiceGmailMessageId(invoice.number);
    let priorMessageId: string | null;
    try {
      priorMessageId = await findSentGmailMessage(connectors, stableMessageId);
    } catch {
      return {
        ok: false,
        message: "Could not check Gmail Sent for a duplicate. No invoice email was sent.",
      };
    }
    if (priorMessageId) {
      if (!(await sentRecipientMatches(connectors, priorMessageId, data.recipient)))
        return {
          ok: false,
          message:
            "An email for this invoice is already in Gmail Sent with a different recipient. It was not sent again; check Gmail Sent.",
        };
      try {
        await markInvoiceSent(actor.id, invoice.id, priorMessageId, sendDate);
        return {
          ok: true,
          sent: true,
          message: "This invoice was already sent from Gmail; its status is now recorded.",
        };
      } catch {
        return {
          ok: false,
          sent: true,
          uncertain: true,
          message:
            "Gmail shows this invoice was sent, but the app could not update its status. Do not send it again; refresh the invoice and check its status.",
        };
      }
    }

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
        contactName: data.contactName,
        paymentInstructions: data.paymentInstructions,
        senderName: data.senderName,
        senderPhone: data.senderPhone,
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
      includeBcc: data.includeBcc,
    });

    let sendResponse: Response;
    try {
      sendResponse = await connectors.proxy("google-mail", "/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
    } catch {
      return {
        ok: false,
        uncertain: true,
        message:
          "Gmail did not confirm the send. Check Gmail Sent before retrying; the email may already have been sent.",
      };
    }
    if (!sendResponse.ok)
      return {
        ok: false,
        uncertain: sendResponse.status >= 500,
        message:
          sendResponse.status >= 500
            ? "Gmail did not confirm the send. Check Gmail Sent before retrying; the email may already have been sent."
            : "Gmail rejected the email. No send was confirmed; check the recipient and Gmail connection.",
      };
    let sent: { id?: string };
    try {
      sent = (await sendResponse.json()) as { id?: string };
    } catch {
      return {
        ok: false,
        uncertain: true,
        message:
          "Gmail accepted the request but its response could not be read. Check Gmail Sent before retrying.",
      };
    }
    if (!sent.id)
      return {
        ok: false,
        uncertain: true,
        message:
          "Gmail accepted the request but did not confirm a message ID. Check Gmail Sent before retrying.",
      };

    try {
      await markInvoiceSent(actor.id, invoice.id, sent.id, sendDate);
    } catch {
      return {
        ok: false,
        sent: true,
        uncertain: true,
        message:
          "Gmail sent the invoice, but the app could not update its status. Do not send it again; refresh the invoice and check its status.",
      };
    }
    return {
      ok: true,
      sent: true,
      message: `Invoice ${invoice.number} was sent to ${data.recipient} from qpemissions@gmail.com and marked as sent.`,
    };
  } catch {
    return {
      ok: false,
      message: "Unable to send the invoice. No email send was confirmed.",
    };
  }
}
