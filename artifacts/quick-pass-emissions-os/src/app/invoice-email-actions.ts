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
import { prepareInvoicePaymentLink } from "@/modules/finance/stripe-payments";
import { BusinessError } from "@/modules/phase4";
import type { ActionState } from "./actions";
import {
  findSentGmailResendMessage,
  findSentGmailMessage,
  invoiceGmailMessageId,
  invoiceGmailRawMessage,
} from "@/modules/finance/invoice-gmail";

export type InvoiceGmailSendState = {
  ok: boolean;
  message: string;
  sent?: boolean;
  uncertain?: boolean;
  resendAttemptId?: string;
};

const requestSchema = z.object({
  invoiceId: z.string().trim().min(1).max(64),
  sendMode: z.enum(["ISSUE", "RESEND"]).default("ISSUE"),
  resendRequestId: z.uuid().optional(),
  recipient: z.email().max(254),
  contactName: z.string().trim().min(1).max(160),
  paymentInstructions: z.string().trim().max(500).default(""),
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
  let resendRequestId: string | undefined;
  let gmailSendStarted = false;
  try {
    const isResend = data.sendMode === "RESEND";
    if (isResend && !data.resendRequestId)
      return { ok: false, message: "Refresh the invoice page before resending." };
    const detail = await finance.invoiceDetail(actor.id, data.invoiceId);
    const invoice = detail.invoice;
    if (!invoice) return { ok: false, message: "Invoice not found." };
    if (invoice.archivedAt)
      return {
        ok: false,
        message: "Restore this archived invoice before sending it.",
      };
    if (invoice.state === "SENT" && !isResend)
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
    if (remainingCents <= 0 && !isResend)
      return { ok: false, message: "Only invoices with an unpaid balance can be sent." };
    if (!isResend && invoice.payments.some((payment) => payment.date < sendDate))
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

    if (isResend) {
      const requestedId = data.resendRequestId!;
      const reservation = await finance.beginInvoiceResend(actor.id, {
        invoiceId: invoice.id,
        requestId: requestedId,
        recipient: data.recipient,
      });
      const attempt = reservation.attempt;
      if (reservation.status === "SENT")
        return {
          ok: true,
          sent: true,
          message: "This resend was already confirmed in Gmail Sent.",
        };
      if (reservation.status === "RECONCILE") {
        try {
          const sentId = await findSentGmailResendMessage(connectors, {
            requestId: attempt.requestId,
            invoiceNumber: invoice.number,
            recipient: attempt.recipient,
            createdAt: attempt.createdAt,
          });
          if (sentId) {
            await finance.finishInvoiceResend(actor.id, {
              requestId: attempt.requestId,
              gmailMessageId: sentId,
            });
            revalidatePath(`/invoices/${invoice.id}`);
            revalidatePath("/invoices");
            revalidatePath("/dealerships");
            return {
              ok: true,
              sent: true,
              message: "The earlier resend is already in Gmail Sent; no duplicate was sent.",
            };
          }
          await finance.updateInvoiceResendFailure(actor.id, attempt.requestId, "UNCERTAIN");
          revalidatePath(`/invoices/${invoice.id}`);
          return {
            ok: false,
            uncertain: true,
            resendAttemptId: attempt.id,
            message:
              "A previous resend may have gone through. Nothing was resent. Check Gmail Sent before resolving this attempt.",
          };
        } catch {
          return {
            ok: false,
            uncertain: true,
            resendAttemptId: attempt.id,
            message: "Could not verify this resend in Gmail Sent. Nothing was resent.",
          };
        }
      }
      resendRequestId = requestedId;
      try {
        const existing = await findSentGmailResendMessage(connectors, {
          requestId: requestedId,
          invoiceNumber: invoice.number,
          recipient: data.recipient,
          createdAt: attempt.createdAt,
        });
        if (existing) {
          await finance.finishInvoiceResend(actor.id, {
            requestId: requestedId,
            gmailMessageId: existing,
          });
          revalidatePath(`/invoices/${invoice.id}`);
          return {
            ok: true,
            sent: true,
            message: "This resend was already in Gmail Sent; no duplicate was sent.",
          };
        }
      } catch {
        await finance.updateInvoiceResendFailure(actor.id, requestedId, "UNCERTAIN");
        revalidatePath(`/invoices/${invoice.id}`);
        return {
          ok: false,
          uncertain: true,
          resendAttemptId: attempt.id,
          message:
            "Could not verify Gmail Sent. Nothing was resent; check the invoice before retrying.",
        };
      }
    } else {
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
    }

    const snapshot = invoiceSnapshotSchema.parse(invoice.snapshot);
    let paymentLink: Awaited<ReturnType<typeof prepareInvoicePaymentLink>> | undefined;
    try {
      if (remainingCents > 0) paymentLink = await prepareInvoicePaymentLink(actor.id, invoice.id);
    } catch (error) {
      if (resendRequestId)
        await finance.updateInvoiceResendFailure(actor.id, resendRequestId, "FAILED");
      throw error;
    }
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
      paymentLink?.hostedUrl ?? undefined,
    );
    const pdf = await createInvoicePdf({
      ...invoice,
      status: balance.status,
      snapshot,
      demo: detail.demo,
      paidCents: balance.paidCents,
      remainingCents,
      paymentUrl: paymentLink?.hostedUrl,
    });
    const raw = invoiceGmailRawMessage({
      to: data.recipient,
      subject: email.subject,
      body: email.body,
      invoiceNumber: invoice.number,
      pdf,
      includeBcc: data.includeBcc,
      resendRequestId,
    });

    let sendResponse: Response;
    try {
      gmailSendStarted = true;
      sendResponse = await connectors.proxy("google-mail", "/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
    } catch {
      if (resendRequestId)
        await finance.updateInvoiceResendFailure(actor.id, resendRequestId, "UNCERTAIN");
      return {
        ok: false,
        uncertain: true,
        resendAttemptId: resendRequestId,
        message:
          "Gmail did not confirm the send. Check Gmail Sent before retrying; the email may already have been sent.",
      };
    }
    if (!sendResponse.ok) {
      if (resendRequestId)
        await finance.updateInvoiceResendFailure(
          actor.id,
          resendRequestId,
          sendResponse.status >= 500 ? "UNCERTAIN" : "FAILED",
        );
      return {
        ok: false,
        uncertain: sendResponse.status >= 500,
        resendAttemptId: resendRequestId,
        message:
          sendResponse.status >= 500
            ? "Gmail did not confirm the send. Check Gmail Sent before retrying; the email may already have been sent."
            : "Gmail rejected the email. No send was confirmed; check the recipient and Gmail connection.",
      };
    }
    let sent: { id?: string };
    try {
      sent = (await sendResponse.json()) as { id?: string };
    } catch {
      if (resendRequestId)
        await finance.updateInvoiceResendFailure(actor.id, resendRequestId, "UNCERTAIN");
      return {
        ok: false,
        uncertain: true,
        resendAttemptId: resendRequestId,
        message:
          "Gmail accepted the request but its response could not be read. Check Gmail Sent before retrying.",
      };
    }
    if (!sent.id) {
      if (resendRequestId)
        await finance.updateInvoiceResendFailure(actor.id, resendRequestId, "UNCERTAIN");
      return {
        ok: false,
        uncertain: true,
        resendAttemptId: resendRequestId,
        message:
          "Gmail accepted the request but did not confirm a message ID. Check Gmail Sent before retrying.",
      };
    }

    try {
      if (resendRequestId)
        await finance.finishInvoiceResend(actor.id, {
          requestId: resendRequestId,
          gmailMessageId: sent.id,
        });
      else await markInvoiceSent(actor.id, invoice.id, sent.id, sendDate);
      revalidatePath(`/invoices/${invoice.id}`);
      revalidatePath("/invoices");
      revalidatePath("/dealerships");
      revalidatePath(`/dealerships/${invoice.dealershipId}`);
    } catch {
      if (resendRequestId)
        await finance.updateInvoiceResendFailure(actor.id, resendRequestId, "UNCERTAIN");
      return {
        ok: false,
        sent: true,
        uncertain: true,
        resendAttemptId: resendRequestId,
        message: resendRequestId
          ? "Gmail sent the resend, but the app could not record it. Check Gmail Sent before retrying."
          : "Gmail sent the invoice, but the app could not update its status. Do not send it again; refresh the invoice and check its status.",
      };
    }
    return {
      ok: true,
      sent: true,
      message: resendRequestId
        ? `Invoice ${invoice.number} was resent to ${data.recipient}; the invoice and VIR totals were not changed.`
        : `Invoice ${invoice.number} was sent to ${data.recipient} from qpemissions@gmail.com and marked as sent.`,
    };
  } catch (error) {
    if (resendRequestId && !gmailSendStarted)
      await finance.updateInvoiceResendFailure(actor.id, resendRequestId, "FAILED").catch(() => {});
    if (error instanceof BusinessError) return { ok: false, message: error.message };
    return {
      ok: false,
      message: "Unable to send the invoice. No email send was confirmed.",
    };
  }
}

export async function checkInvoiceResend(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      invoiceId: z.string().trim().min(1).max(64),
      attemptId: z.string().trim().min(1).max(64),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the resend request." };
  const actor = await currentUser();
  try {
    const [detail, attempt] = await Promise.all([
      finance.invoiceDetail(actor.id, parsed.data.invoiceId),
      finance.invoiceResendAttempt(actor.id, parsed.data.attemptId),
    ]);
    if (!detail.invoice || attempt?.invoiceId !== detail.invoice.id)
      return { ok: false, message: "Resend request not found." };
    const connectors = new ReplitConnectors();
    const profile = await connectors.proxy("google-mail", "/gmail/v1/users/me/profile", {
      method: "GET",
    });
    if (!profile.ok) return { ok: false, message: "Could not verify the connected Gmail account." };
    const identity = (await profile.json()) as { emailAddress?: string };
    if (identity.emailAddress?.toLowerCase() !== invoiceIssuer.email)
      return { ok: false, message: "Connect Gmail as qpemissions@gmail.com before checking." };
    const sentId = await findSentGmailResendMessage(connectors, {
      requestId: attempt.requestId,
      invoiceNumber: detail.invoice.number,
      recipient: attempt.recipient,
      createdAt: attempt.createdAt,
    });
    if (sentId) {
      await finance.finishInvoiceResend(actor.id, {
        requestId: attempt.requestId,
        gmailMessageId: sentId,
      });
      revalidatePath(`/invoices/${detail.invoice.id}`);
      revalidatePath("/invoices");
      revalidatePath("/dealerships");
      return {
        ok: true,
        message: "Gmail Sent confirms this resend. The invoice totals were unchanged.",
      };
    }
    await finance.updateInvoiceResendFailure(actor.id, attempt.requestId, "UNCERTAIN");
    revalidatePath(`/invoices/${detail.invoice.id}`);
    return {
      ok: true,
      message:
        "No matching resend is visible in Gmail Sent yet. Nothing was resent. Check Gmail Sent before releasing this request.",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof BusinessError ? error.message : "Could not verify Gmail Sent.",
    };
  }
}

export async function resolveInvoiceResendNotSent(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      invoiceId: z.string().trim().min(1).max(64),
      attemptId: z.string().trim().min(1).max(64),
      confirmNoEmail: z.literal("true"),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success)
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Confirm the Sent-folder check.",
    };
  const actor = await currentUser();
  try {
    const attempt = await finance.invoiceResendAttempt(actor.id, parsed.data.attemptId);
    if (attempt?.invoiceId !== parsed.data.invoiceId)
      return { ok: false, message: "Resend request not found." };
    await finance.resolveInvoiceResendNotSent(actor.id, {
      id: attempt.id,
      confirmNoEmail: parsed.data.confirmNoEmail,
    });
    revalidatePath(`/invoices/${parsed.data.invoiceId}`);
    return {
      ok: true,
      message: "Resend request released. You can now start a new confirmed resend.",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof BusinessError ? error.message : "Could not release this resend.",
    };
  }
}
