"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { z } from "zod";
import { currentUser } from "@/lib/access";
import { fields } from "@/lib/validation";
import { BusinessError } from "@/modules/phase4";
import * as finance from "@/modules/finance/service";
import * as stripePayments from "@/modules/finance/stripe-payments";
import { findSentGmailMessage, invoiceGmailMessageId } from "@/modules/finance/invoice-gmail";
import { invoiceIssuer } from "@/modules/finance/invoice-document";
import type { ActionState } from "./actions";
async function perform(
  work: (actorId: string) => Promise<unknown>,
  successMessage = "Saved successfully.",
): Promise<ActionState> {
  const actor = await currentUser();
  try {
    await work(actor.id);
    revalidatePath("/", "layout");
    return { ok: true, message: successMessage };
  } catch (error) {
    if (error instanceof BusinessError) return { ok: false, message: error.message };
    if (error instanceof z.ZodError)
      return { ok: false, message: error.issues[0]?.message ?? "Check your entries." };
    return {
      ok: false,
      message: "Unable to save. Check your entries and connection, then refresh and try again.",
    };
  }
}
export async function saveDealer(_: ActionState, form: FormData) {
  return perform((actor) =>
    finance.saveDealer(actor, {
      ...fields(form),
      ...(form.has("active") ? { active: form.get("active") === "true" } : {}),
    }),
  );
}
export async function saveContact(_: ActionState, form: FormData) {
  return perform((actor) =>
    finance.saveContact(actor, {
      ...fields(form),
      ...(form.has("active") ? { active: form.get("active") === "true" } : {}),
    }),
  );
}
export async function authorizeTerms(_: ActionState, form: FormData) {
  return perform((actor) => finance.authorizeTerms(actor, fields(form)));
}
export async function recordService(_: ActionState, form: FormData) {
  return perform((actor) => finance.recordService(actor, fields(form)));
}
export async function voidService(_: ActionState, form: FormData) {
  return perform((actor) => finance.voidService(actor, fields(form)));
}
export async function reviewInvoice(_: ActionState, form: FormData) {
  return perform((actor) => finance.reviewInvoice(actor, fields(form)));
}
export async function recordDealerPayment(_: ActionState, form: FormData) {
  return perform((actor) => finance.recordDealerPayment(actor, fields(form)));
}
export async function reverseDealerPayment(_: ActionState, form: FormData) {
  return perform((actor) => finance.reverseDealerPayment(actor, fields(form)));
}
export async function recordEntry(_: ActionState, form: FormData) {
  return perform((actor) =>
    finance.recordEntry(actor, {
      ...fields(form),
      separateRecord: form.get("separateRecord") === "true",
    }),
  );
}
export async function reviewEntry(_: ActionState, form: FormData) {
  return perform((actor) => finance.reviewEntry(actor, fields(form)));
}
export async function createInvoice(_: ActionState, form: FormData) {
  let invoiceId: string | undefined;
  const result = await perform(async (actor) => {
    const invoice = await finance.createInvoice(actor, {
      ...fields(form),
      serviceIds: form.getAll("serviceIds"),
    });
    invoiceId = invoice.id;
  });
  if (result.ok && invoiceId) redirect(`/invoices/${invoiceId}`);
  return result;
}
export async function setDealerInvoiceArchived(_: ActionState, form: FormData) {
  const archived = form.get("archived") === "true";
  return perform(
    (actor) =>
      finance.setInvoiceArchived(actor, {
        ...fields(form),
        archived,
      }),
    archived ? "Invoice archived." : "Invoice restored to the active list.",
  );
}
export async function createInvoicePaymentLink(_: ActionState, form: FormData) {
  return perform(async (actor) => {
    const data = z
      .object({
        invoiceId: z.string().trim().min(1).max(64),
      })
      .parse(fields(form));
    await stripePayments.createInvoicePaymentLink(actor, data.invoiceId);
    revalidatePath(`/invoices/${data.invoiceId}`);
  }, "The secure payment link is ready.");
}
export async function refreshInvoicePayment(_: ActionState, form: FormData) {
  return perform(async (actor) => {
    const invoiceId = z.string().trim().min(1).max(64).parse(form.get("invoiceId"));
    await stripePayments.refreshInvoicePayment(actor, invoiceId);
    revalidatePath(`/invoices/${invoiceId}`);
  }, "Payment status checked with Stripe.");
}
export async function cancelInvoicePaymentLink(_: ActionState, form: FormData) {
  return perform(async (actor) => {
    const invoiceId = z.string().trim().min(1).max(64).parse(form.get("invoiceId"));
    await stripePayments.cancelInvoicePaymentLink(actor, invoiceId);
    revalidatePath(`/invoices/${invoiceId}`);
  }, "Online payment was safely cancelled. Existing email payment links are now disabled.");
}
export async function deleteDraftInvoice(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await currentUser();
  const parsed = z
    .object({
      id: z.string().trim().min(1).max(64),
      version: z.coerce.number().int().nonnegative(),
    })
    .safeParse(fields(form));
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the invoice." };

  try {
    const detail = await finance.invoiceDetail(actor.id, parsed.data.id);
    const invoice = detail.invoice;
    if (!invoice) return { ok: false, message: "Invoice not found." };
    if (invoice.version !== parsed.data.version)
      return { ok: false, message: "Invoice changed. Refresh and review it before deleting." };
    if (
      invoice.state !== "DRAFT" ||
      invoice.approvedAt ||
      invoice.sentDate ||
      invoice.deliveryReference ||
      invoice.payments.length > 0
    )
      return {
        ok: false,
        message: "Only unsent draft invoices with no payments can be deleted.",
      };

    const connectors = new ReplitConnectors();
    const profileResponse = await connectors.proxy("google-mail", "/gmail/v1/users/me/profile", {
      method: "GET",
    });
    if (!profileResponse.ok)
      return {
        ok: false,
        message: "Could not verify Gmail Sent. The draft was not deleted.",
      };
    const profile = (await profileResponse.json()) as { emailAddress?: string };
    if (profile.emailAddress?.toLowerCase() !== invoiceIssuer.email)
      return {
        ok: false,
        message: "Connect qpemissions@gmail.com to verify the draft was not sent.",
      };
    const priorMessageId = await findSentGmailMessage(
      connectors,
      invoiceGmailMessageId(invoice.number),
    );
    if (priorMessageId)
      return {
        ok: false,
        message: "Gmail Sent contains an email for this invoice. Archive it instead of deleting.",
      };
    await finance.deleteDraftInvoice(actor.id, parsed.data);
  } catch (error) {
    if (error instanceof BusinessError) return { ok: false, message: error.message };
    if (error instanceof z.ZodError)
      return { ok: false, message: error.issues[0]?.message ?? "Check the invoice." };
    return {
      ok: false,
      message: "Could not safely delete this draft. It was left unchanged.",
    };
  }

  revalidatePath("/invoices");
  revalidatePath("/dealerships");
  revalidatePath("/", "layout");
  redirect("/invoices");
}
