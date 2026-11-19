import { z } from "zod";
import { readAsActor } from "@/lib/read-as-actor";
import { serviceMarketing } from "../marketing/promotions";
import { randomUUID } from "node:crypto";
import { savedContactAddress } from "@/lib/address-provenance";
import {
  addressInputShape,
  addressKeys,
  contactPhoneInput,
  formatContactAddress,
} from "@/lib/contact-address";
import { uniqueReceiptReference } from "./references";
import { STANDARD_DEALERSHIP_TERMS } from "./dealership-terms";
import { closeInvoicePaymentLink } from "./stripe-payments";
import { formatInvoiceNumber, isInvoiceNumberForYear, nextInvoiceSequence } from "./invoice-number";
import { id, dateString } from "@/lib/validation";
import { businessDate, addDays } from "@/lib/time";
import { label, reason, notes, optionalId, version } from "../maintenance/validation";
import { phase4, financeRoles, reviewers, requireRule, audit, type Tx } from "../phase4";
import {
  positiveCents,
  invoiceTotals,
  receivable,
  reportRange,
  sumCents,
  csv,
  requiredInteger,
} from "./rules";

export function invoiceServiceDescription(description: string, value: unknown) {
  const inspections = Array.isArray(value)
    ? value.flatMap((entry) => {
        if (typeof entry === "string" && /^[A-Z0-9-]{1,40}$/.test(entry)) return [`VIN: ${entry}`];
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const detail = entry as Record<string, unknown>;
        if (typeof detail.vin !== "string" || !/^[A-Z0-9-]{1,40}$/.test(detail.vin)) return [];
        const identifier =
          typeof detail.testNumber === "string" && detail.testNumber
            ? `Test ID: ${detail.testNumber} · `
            : typeof detail.certificate === "string" && detail.certificate
              ? `Certificate: ${detail.certificate} · `
              : "";
        return [`${identifier}VIN: ${detail.vin}`];
      })
    : [];
  return inspections.length
    ? `${description}\nInspection details:\n${inspections.join("\n")}`
    : description;
}
export const categories = [
  "EMISSIONS",
  "TAG_KIOSK",
  "CARWASH",
  "DETAILING",
  "INVENTORY",
  "PAYROLL",
  "COMMISSIONS",
  "REPAIRS",
  "UTILITIES",
  "VENDOR",
  "OTHER",
] as const;
const currentPast = (date: string) =>
  requireRule(date <= businessDate(), "Use a current or past business date.");
async function assertBillingHistory(
  tx: Tx,
  serviceIds: string[],
  issueDate: string,
  invoiceId?: string,
) {
  const history = await tx.dealerInvoiceLine.findMany({
    where: {
      serviceId: { in: serviceIds },
      ...(invoiceId ? { invoiceId: { not: invoiceId } } : {}),
    },
    include: { invoice: { select: { state: true, voidDate: true } } },
  });
  requireRule(
    history.every(
      ({ invoice }) =>
        invoice.state === "VOIDED" && invoice.voidDate !== null && invoice.voidDate <= issueDate,
    ),
    "A service has prior invoice history. Reissue on or after the previous invoice's void date.",
  );
}
export async function saveDealer(actorId: string, input: unknown) {
  const {
    id: key,
    version: v,
    reason: why,
    addressProof,
    ...data
  } = z
    .object({
      id: optionalId,
      version,
      code: label.optional(),
      name: label,
      billingAddress: reason.optional(),
      phone: contactPhoneInput.optional(),
      email: z
        .union([z.email().max(254), z.literal("")])
        .transform((v) => v.toLowerCase())
        .optional(),
      ...addressInputShape,
      notes,
      active: z.boolean().optional(),
      reason: reason.optional().default("Dealership details saved."),
    })
    .parse(input);
  return phase4(actorId, financeRoles, async (tx) => {
    const before = key ? await tx.dealership.findUnique({ where: { id: key } }) : null;
    requireRule(!key || before?.version === v, "Dealership changed. Refresh and review it.");
    const structured = addressKeys.some((key) => data[key] !== undefined);
    const legacyChanged =
      !structured &&
      data.billingAddress !== undefined &&
      data.billingAddress !== before?.billingAddress;
    const address = savedContactAddress(
      legacyChanged
        ? {
            streetAddress: data.billingAddress,
            addressLine2: "",
            city: "",
            state: "",
            postalCode: "",
          }
        : { ...data, addressProof },
      legacyChanged ? null : before,
    );
    const saved = {
      ...data,
      ...address,
      code: data.code ?? before?.code ?? `DLR-${randomUUID()}`,
      phone: data.phone ?? before?.phone ?? "",
      email: data.email ?? before?.email ?? "",
      billingAddress: structured
        ? formatContactAddress(address) || data.billingAddress || ""
        : (data.billingAddress ?? before?.billingAddress ?? ""),
      active: data.active ?? before?.active ?? true,
    };
    requireRule(saved.billingAddress.trim().length > 0, "Enter a billing address.");
    requireRule(
      !(await tx.dealership.count({
        where: { code: saved.code, ...(key ? { id: { not: key } } : {}) },
      })),
      "Dealership code already exists.",
    );
    const row = key
      ? await tx.dealership.update({
          where: { id: key },
          data: { ...saved, version: { increment: 1 } },
        })
      : await tx.dealership.create({
          data: {
            ...saved,
            ...STANDARD_DEALERSHIP_TERMS,
            termsAuthorizedBy: actorId,
            termsAuthorizedAt: new Date(),
          },
        });
    await audit(tx, actorId, "DEALER_SAVED", row.id, {
      before,
      ...saved,
      ...(!key ? STANDARD_DEALERSHIP_TERMS : {}),
      reason: why,
    });
    return row;
  });
}
/** Apply the owner's standing rate without rewriting existing services or invoice snapshots. */
export async function applyStandardDealershipRate(actorId: string) {
  return phase4(actorId, ["OWNER"], async (tx) => {
    const dealers = await tx.dealership.findMany();
    let updated = 0;
    for (const before of dealers) {
      if (
        before.defaultRateCents === STANDARD_DEALERSHIP_TERMS.defaultRateCents &&
        before.termsDays !== null &&
        before.taxBps !== null &&
        before.termsAuthorizedAt
      )
        continue;
      const data = {
        defaultRateCents: STANDARD_DEALERSHIP_TERMS.defaultRateCents,
        termsDays: before.termsDays ?? STANDARD_DEALERSHIP_TERMS.termsDays,
        taxBps: before.taxBps ?? STANDARD_DEALERSHIP_TERMS.taxBps,
        termsReference: before.termsReference || STANDARD_DEALERSHIP_TERMS.termsReference,
        termsAuthorizedBy: actorId,
        termsAuthorizedAt: new Date(),
      };
      await tx.dealership.update({
        where: { id: before.id, version: before.version },
        data: { ...data, version: { increment: 1 } },
      });
      await audit(tx, actorId, "DEALER_TERMS_AUTHORIZED", before.id, {
        before,
        ...data,
        reason: "Owner confirmed all dealerships are $15 per car.",
      });
      updated++;
    }
    return { updated, total: dealers.length };
  });
}
export async function saveContact(actorId: string, input: unknown) {
  const {
    id: key,
    version: v,
    reason: why,
    ...data
  } = z
    .object({
      id: optionalId,
      version,
      dealershipId: id,
      name: label,
      email: z.union([z.email().max(254), z.literal("")]),
      phone: contactPhoneInput,
      purpose: label,
      source: reason,
      active: z.boolean().optional(),
      reason: reason.optional().default("Dealership contact details saved."),
    })
    .refine((v) => !!v.email || !!v.phone, "Enter a contact phone or email.")
    .parse(input);
  return phase4(actorId, financeRoles, async (tx) => {
    requireRule(
      await tx.dealership.count({ where: { id: data.dealershipId } }),
      "Choose a dealership.",
    );
    const before = key ? await tx.dealerContact.findUnique({ where: { id: key } }) : null;
    requireRule(
      !key || (before?.version === v && before.dealershipId === data.dealershipId),
      "Contact changed. Refresh and review it.",
    );
    const saved = { ...data, active: data.active ?? before?.active ?? true };
    const row = key
      ? await tx.dealerContact.update({
          where: { id: key },
          data: { ...saved, version: { increment: 1 } },
        })
      : await tx.dealerContact.create({ data: saved });
    await audit(tx, actorId, "DEALER_CONTACT", row.id, { before, ...saved, reason: why });
    return row;
  });
}
export async function authorizeTerms(actorId: string, input: unknown) {
  const data = z
    .object({
      id,
      version,
      termsDays: requiredInteger(0, 365),
      defaultRateCents: positiveCents,
      taxBps: requiredInteger(0, 10000),
      termsReference: reason,
      reason: reason.optional().default("Dealership billing terms authorized."),
    })
    .parse(input);
  return phase4(actorId, ["OWNER"], async (tx) => {
    const before = await tx.dealership.findUnique({ where: { id: data.id } });
    requireRule(
      before?.version === data.version && before.active,
      "Dealership changed or is inactive. Refresh and review it.",
    );
    const row = await tx.dealership.update({
      where: { id: data.id },
      data: {
        termsDays: data.termsDays,
        defaultRateCents: data.defaultRateCents,
        taxBps: data.taxBps,
        termsReference: data.termsReference,
        termsAuthorizedBy: actorId,
        termsAuthorizedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await audit(tx, actorId, "DEALER_TERMS_AUTHORIZED", row.id, { before, ...data });
    return row;
  });
}
export async function recordService(actorId: string, input: unknown) {
  const data = z
    .object({
      dealershipId: id,
      date: dateString,
      description: label,
      quantity: z.coerce.number().int().min(1).max(100000),
      unitCents: positiveCents,
      reference: label,
      evidence: reason,
    })
    .parse(input);
  invoiceTotals([data], 0);
  return phase4(actorId, financeRoles, async (tx) => {
    currentPast(data.date);
    requireRule(
      await tx.dealership.count({ where: { id: data.dealershipId, active: true } }),
      "Choose an active dealership.",
    );
    requireRule(
      !(await tx.dealerService.count({ where: { reference: data.reference } })),
      "Service reference already exists.",
    );
    const row = await tx.dealerService.create({ data: { ...data, createdBy: actorId } });
    const finalCents = await serviceMarketing(tx, actorId, input, row);
    if (finalCents !== row.unitCents) {
      await tx.dealerService.update({ where: { id: row.id }, data: { unitCents: finalCents } });
    }
    await audit(tx, actorId, "DEALER_SERVICE", row.id, data);
    return { ...row, unitCents: finalCents };
  });
}
export async function voidService(actorId: string, input: unknown) {
  const data = z.object({ id, reason }).parse(input);
  return phase4(actorId, reviewers, async (tx) => {
    const row = await tx.dealerService.findUnique({ where: { id: data.id } });
    requireRule(
      row && !row.invoiceId && !row.voidDate,
      "Only an unbilled, active service can be voided.",
    );
    await tx.dealerService.update({
      where: { id: row.id },
      data: { voidDate: businessDate(), voidReason: data.reason },
    });
    await audit(tx, actorId, "DEALER_SERVICE_VOIDED", row.id, data);
  });
}
export async function createInvoice(actorId: string, input: unknown) {
  return phase4(actorId, financeRoles, (tx) => createInvoiceInTransaction(tx, actorId, input));
}

/** Shared by the manual invoice form and the atomic, reviewed VIR import. */
export async function createInvoiceInTransaction(tx: Tx, actorId: string, input: unknown) {
  const data = z
    .object({
      dealershipId: id,
      number: z.string().trim().max(40).optional().default(""),
      issueDate: dateString,
      serviceIds: z.array(id).min(1).max(100),
      notes,
    })
    .parse(input);
  requireRule(
    new Set(data.serviceIds).size === data.serviceIds.length,
    "Select distinct services.",
  );
  currentPast(data.issueDate);
  const year = data.issueDate.slice(0, 4);
  const existingNumbers = (
    await tx.dealerInvoice.findMany({
      where: { number: { startsWith: `QP-${year}-` } },
      select: { number: true },
    })
  ).map((invoice) => invoice.number);
  const deletedInvoiceAudits = await tx.auditLog.findMany({
    where: { action: "DEALER_INVOICE_DELETED" },
    select: { details: true },
  });
  const deletedNumbers = deletedInvoiceAudits.flatMap(({ details }) => {
    if (!details || typeof details !== "object" || Array.isArray(details)) return [];
    const number = (details as Record<string, unknown>).number;
    return typeof number === "string" ? [number] : [];
  });
  const number =
    data.number ||
    formatInvoiceNumber(year, nextInvoiceSequence(year, [...existingNumbers, ...deletedNumbers]));
  requireRule(
    isInvoiceNumberForYear(number, year),
    `Invoice number must use QP-${year}-0001 format for its issue year.`,
  );
  requireRule(!deletedNumbers.includes(number), "Invoice number was used by a deleted draft.");
  const dealer = await tx.dealership.findUnique({
    where: { id: data.dealershipId },
    include: { contacts: { where: { active: true }, orderBy: { createdAt: "asc" } } },
  });
  requireRule(
    dealer?.active &&
      dealer.termsAuthorizedAt &&
      dealer.termsDays !== null &&
      dealer.taxBps !== null,
    "Owner-authorized terms and tax settings are required.",
  );
  requireRule(
    !(await tx.dealerInvoice.count({ where: { number } })),
    "Invoice number already exists.",
  );
  const services = await tx.dealerService.findMany({
    where: {
      id: { in: data.serviceIds },
      dealershipId: dealer.id,
      invoiceId: null,
      voidDate: null,
      date: { lte: data.issueDate },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
  requireRule(
    services.length === data.serviceIds.length,
    "A service changed, is already billed, or is after the issue date. Refresh and review.",
  );
  await assertBillingHistory(tx, data.serviceIds, data.issueDate);
  const totals = invoiceTotals(services, dealer.taxBps);
  const row = await tx.dealerInvoice.create({
    data: {
      dealershipId: dealer.id,
      number,
      issueDate: data.issueDate,
      dueDate: addDays(data.issueDate, dealer.termsDays),
      subtotalCents: totals.subtotalCents,
      taxBps: dealer.taxBps,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      notes: data.notes,
      createdBy: actorId,
      snapshot: {
        code: dealer.code,
        name: dealer.name,
        billingAddress: dealer.billingAddress,
        phone: dealer.phone,
        contacts: [
          ...dealer.contacts.map((c) => ({
            name: c.name,
            email: c.email,
            phone: c.phone,
            purpose: c.purpose,
          })),
          ...(dealer.email &&
          !dealer.contacts.some((c) => c.email.toLowerCase() === dealer.email.toLowerCase())
            ? [
                {
                  name: dealer.name,
                  email: dealer.email,
                  phone: dealer.phone,
                  purpose: "Billing",
                },
              ]
            : []),
        ],
        termsDays: dealer.termsDays,
        defaultRateCents: dealer.defaultRateCents,
        taxBps: dealer.taxBps,
        termsReference: dealer.termsReference,
        termsAuthorizedBy: dealer.termsAuthorizedBy,
        termsAuthorizedAt: dealer.termsAuthorizedAt.toISOString(),
      },
      lines: {
        create: services.map((s, i) => ({
          serviceId: s.id,
          date: s.date,
          description: invoiceServiceDescription(s.description, s.vehicleVins),
          quantity: s.quantity,
          unitCents: s.unitCents,
          amountCents: totals.amounts[i],
        })),
      },
    },
  });
  await tx.dealerService.updateMany({
    where: { id: { in: data.serviceIds } },
    data: { invoiceId: row.id },
  });
  await audit(tx, actorId, "DEALER_INVOICE_DRAFT", row.id, {
    number: row.number,
    serviceIds: data.serviceIds,
    totalCents: row.totalCents,
  });
  return row;
}
export async function reviewInvoice(actorId: string, input: unknown) {
  const data = z
    .object({
      id,
      version,
      decision: z.enum(["APPROVE", "SENT", "VOID"]),
      date: dateString,
      reference: notes,
      reason,
    })
    .parse(input);
  return phase4(actorId, reviewers, async (tx) => {
    currentPast(data.date);
    const row = await tx.dealerInvoice.findUnique({
      where: { id: data.id },
      include: { payments: true, lines: true, stripePaymentLink: true },
    });
    requireRule(
      row?.version === data.version && row.state !== "VOIDED" && !row.archivedAt,
      "Invoice changed, is archived, or is voided. Restore it if needed, then refresh and review.",
    );
    requireRule(data.date >= row.issueDate, "Action date cannot precede issue date.");
    if (data.decision === "APPROVE") {
      requireRule(
        row.state === "DRAFT" && row.createdBy !== actorId,
        "A different owner or manager must approve the draft.",
      );
      await assertBillingHistory(
        tx,
        row.lines.map((line) => line.serviceId),
        row.issueDate,
        row.id,
      );
      await tx.dealerInvoice.update({
        where: { id: row.id },
        data: {
          state: "APPROVED",
          approvedBy: actorId,
          approvedAt: new Date(),
          version: { increment: 1 },
        },
      });
    } else if (data.decision === "SENT") {
      requireRule(
        row.state === "APPROVED" && data.reference.length > 0,
        "Record a delivery reference for an approved invoice.",
      );
      requireRule(
        row.payments.every((p) => p.date >= data.date),
        "Delivery date cannot be after an already recorded payment. Review the source dates.",
      );
      await tx.dealerInvoice.update({
        where: { id: row.id },
        data: {
          state: "SENT",
          sentDate: data.date,
          deliveryReference: data.reference,
          version: { increment: 1 },
        },
      });
    } else {
      requireRule(
        sumCents(row.payments.map((p) => p.amountCents)) === 0,
        "Reverse all payments before voiding an invoice.",
      );
      // Void today; retain historical balances and all original snapshots/lines.
      requireRule(data.date === businessDate(), "Void using today's business date.");
      if (row.stripePaymentLink) await closeInvoicePaymentLink(tx, row.id);
      await tx.dealerInvoice.update({
        where: { id: row.id },
        data: {
          state: "VOIDED",
          voidDate: data.date,
          voidReason: data.reason,
          version: { increment: 1 },
        },
      });
      await tx.dealerService.updateMany({
        where: { invoiceId: row.id },
        data: { invoiceId: null },
      });
    }
    await audit(tx, actorId, `DEALER_INVOICE_${data.decision}`, row.id, data);
  });
}
/** A confirmed Gmail send is the issue/approval action for an otherwise-unapproved draft. */
export async function recordGmailInvoiceSent(actorId: string, input: unknown) {
  const data = z.object({ id, version, date: dateString, reference: label }).parse(input);
  return phase4(actorId, reviewers, async (tx) => {
    currentPast(data.date);
    const row = await tx.dealerInvoice.findUnique({
      where: { id: data.id },
      include: { payments: true, lines: true, stripePaymentLink: true },
    });
    if (row?.state === "SENT" && row.deliveryReference === data.reference) return row;
    requireRule(
      row?.version === data.version &&
        (row.state === "DRAFT" || row.state === "APPROVED") &&
        !row.archivedAt,
      "Invoice changed, is archived, or is no longer available to send. Restore it if needed, then refresh.",
    );
    requireRule(data.date >= row.issueDate, "Send date cannot precede the invoice date.");
    requireRule(
      row.payments.every((payment) => payment.date >= data.date),
      "A payment is dated before the send date. Review the invoice history before sending.",
    );
    if (row.state === "DRAFT")
      await assertBillingHistory(
        tx,
        row.lines.map((line) => line.serviceId),
        row.issueDate,
        row.id,
      );
    const sent = await tx.dealerInvoice.update({
      where: { id: row.id },
      data: {
        state: "SENT",
        approvedBy: row.approvedBy ?? actorId,
        approvedAt: row.approvedAt ?? new Date(),
        sentDate: data.date,
        deliveryReference: data.reference,
        version: { increment: 1 },
      },
    });
    await audit(tx, actorId, "DEALER_INVOICE_SENT", row.id, {
      date: data.date,
      reference: data.reference,
      issuedWithSend: row.state === "DRAFT",
    });
    return sent;
  });
}

const invoiceResendInput = z.object({
  invoiceId: id,
  requestId: z.uuid(),
  recipient: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
});

/** Atomically reserve one deliberate resend or return a prior uncertain attempt for reconciliation. */
export async function beginInvoiceResend(actorId: string, input: unknown) {
  const data = invoiceResendInput.parse(input);
  return phase4(actorId, financeRoles, async (tx) => {
    const invoice = await tx.dealerInvoice.findUnique({ where: { id: data.invoiceId } });
    requireRule(
      invoice?.state === "SENT" && invoice.approvedAt && !invoice.archivedAt,
      "Only an active, previously sent invoice can be resent.",
    );
    const existing = await tx.dealerInvoiceEmailResend.findUnique({
      where: { requestId: data.requestId },
    });
    if (existing) {
      requireRule(
        existing.invoiceId === data.invoiceId && existing.recipient === data.recipient,
        "This resend confirmation does not match the saved request.",
      );
      if (existing.state === "SENT") return { status: "SENT" as const, attempt: existing };
      if (existing.state === "PREPARING" || existing.state === "UNCERTAIN")
        return { status: "RECONCILE" as const, attempt: existing };
      const otherPending = await tx.dealerInvoiceEmailResend.findFirst({
        where: {
          invoiceId: data.invoiceId,
          id: { not: existing.id },
          state: { in: ["PREPARING", "UNCERTAIN"] },
        },
      });
      if (otherPending) return { status: "RECONCILE" as const, attempt: otherPending };
      const attempt = await tx.dealerInvoiceEmailResend.update({
        where: { id: existing.id },
        data: { state: "PREPARING", createdBy: actorId },
      });
      await audit(tx, actorId, "DEALER_INVOICE_RESEND_RETRY", data.invoiceId, {
        attemptId: attempt.id,
        requestId: data.requestId,
      });
      return { status: "READY" as const, attempt };
    }
    const unresolved = await tx.dealerInvoiceEmailResend.findFirst({
      where: { invoiceId: data.invoiceId, state: { in: ["PREPARING", "UNCERTAIN"] } },
      orderBy: { createdAt: "desc" },
    });
    if (unresolved) return { status: "RECONCILE" as const, attempt: unresolved };
    const attempt = await tx.dealerInvoiceEmailResend.create({
      data: {
        invoiceId: data.invoiceId,
        requestId: data.requestId,
        recipient: data.recipient,
        createdBy: actorId,
      },
    });
    await audit(tx, actorId, "DEALER_INVOICE_RESEND_STARTED", data.invoiceId, {
      attemptId: attempt.id,
      recipient: data.recipient,
    });
    return { status: "READY" as const, attempt };
  });
}

export async function invoiceResendAttempt(actorId: string, attemptId: string) {
  const key = id.parse(attemptId);
  return readAsActor(actorId, financeRoles, (tx) =>
    tx.dealerInvoiceEmailResend.findUnique({ where: { id: key } }),
  );
}

export async function finishInvoiceResend(actorId: string, input: unknown) {
  const data = z.object({ requestId: z.uuid(), gmailMessageId: label }).parse(input);
  return phase4(actorId, financeRoles, async (tx) => {
    const attempt = await tx.dealerInvoiceEmailResend.findUnique({
      where: { requestId: data.requestId },
      include: { invoice: true },
    });
    requireRule(attempt, "Invoice resend request not found.");
    if (attempt.state === "SENT") {
      requireRule(attempt.gmailMessageId === data.gmailMessageId, "Resend status already differs.");
      return attempt;
    }
    requireRule(
      attempt.state === "PREPARING" || attempt.state === "UNCERTAIN",
      "This resend request is no longer active.",
    );
    const updated = await tx.dealerInvoiceEmailResend.update({
      where: { id: attempt.id },
      data: { state: "SENT", gmailMessageId: data.gmailMessageId, sentAt: new Date() },
    });
    await audit(tx, actorId, "DEALER_INVOICE_RESEND_SENT", attempt.invoiceId, {
      attemptId: attempt.id,
      gmailMessageId: data.gmailMessageId,
      recipient: attempt.recipient,
    });
    return updated;
  });
}

export async function updateInvoiceResendFailure(
  actorId: string,
  requestId: string,
  state: "UNCERTAIN" | "FAILED",
) {
  const key = z.uuid().parse(requestId);
  return phase4(actorId, financeRoles, async (tx) => {
    const attempt = await tx.dealerInvoiceEmailResend.findUnique({ where: { requestId: key } });
    requireRule(attempt, "Invoice resend request not found.");
    if (attempt.state === "SENT") return attempt;
    const updated = await tx.dealerInvoiceEmailResend.update({
      where: { id: attempt.id },
      data: { state },
    });
    await audit(
      tx,
      actorId,
      state === "UNCERTAIN" ? "DEALER_INVOICE_RESEND_UNCERTAIN" : "DEALER_INVOICE_RESEND_FAILED",
      attempt.invoiceId,
      { attemptId: attempt.id },
    );
    return updated;
  });
}

/** Only after the manager has checked Gmail Sent may an uncertain resend be released. */
export async function resolveInvoiceResendNotSent(actorId: string, input: unknown) {
  const data = z.object({ id, confirmNoEmail: z.literal("true") }).parse(input);
  return phase4(actorId, ["OWNER", "ADMIN"], async (tx) => {
    const attempt = await tx.dealerInvoiceEmailResend.findUnique({ where: { id: data.id } });
    requireRule(
      attempt && (attempt.state === "UNCERTAIN" || attempt.state === "PREPARING"),
      "Only an unresolved resend can be released. Refresh and check its status.",
    );
    requireRule(
      attempt.updatedAt.getTime() < Date.now() - 90_000,
      "This resend may still be running. Wait 90 seconds, then check Gmail Sent again.",
    );
    await tx.dealerInvoiceEmailResend.update({
      where: { id: attempt.id },
      data: { state: "FAILED" },
    });
    await audit(tx, actorId, "DEALER_INVOICE_RESEND_RELEASED", attempt.invoiceId, {
      attemptId: attempt.id,
      reason: "Owner/manager confirmed after checking Gmail Sent that no resend was sent.",
    });
  });
}

export async function setInvoiceArchived(actorId: string, input: unknown) {
  const data = z.object({ id, version, archived: z.boolean() }).parse(input);
  return phase4(actorId, financeRoles, async (tx) => {
    const row = await tx.dealerInvoice.findUnique({
      where: { id: data.id },
      include: { stripePaymentLink: true },
    });
    requireRule(row?.version === data.version, "Invoice changed. Refresh and review it.");
    if (Boolean(row.archivedAt) === data.archived) return row;
    if (data.archived && row.stripePaymentLink) await closeInvoicePaymentLink(tx, row.id);
    const updated = await tx.dealerInvoice.update({
      where: { id: row.id },
      data: {
        archivedAt: data.archived ? new Date() : null,
        version: { increment: 1 },
      },
    });
    await audit(
      tx,
      actorId,
      data.archived ? "DEALER_INVOICE_ARCHIVED" : "DEALER_INVOICE_RESTORED",
      row.id,
      { number: row.number },
    );
    return updated;
  });
}

export async function deleteDraftInvoice(actorId: string, input: unknown) {
  const data = z.object({ id, version }).parse(input);
  return phase4(actorId, financeRoles, async (tx) => {
    const row = await tx.dealerInvoice.findUnique({
      where: { id: data.id },
      include: { payments: true, lines: true, stripePaymentLink: true },
    });
    requireRule(
      row &&
        row.version === data.version &&
        row.state === "DRAFT" &&
        !row.approvedAt &&
        !row.sentDate &&
        !row.deliveryReference &&
        row.payments.length === 0,
      "Only an unsent draft with no payments can be deleted. Refresh and review the invoice.",
    );
    if (row.stripePaymentLink) await closeInvoicePaymentLink(tx, row.id);
    await audit(tx, actorId, "DEALER_INVOICE_DELETED", row.id, {
      number: row.number,
      dealershipId: row.dealershipId,
      totalCents: row.totalCents,
      serviceIds: row.lines.map((line) => line.serviceId),
    });
    await tx.dealerService.updateMany({
      where: { invoiceId: row.id },
      data: { invoiceId: null },
    });
    await tx.dealerInvoiceLine.deleteMany({ where: { invoiceId: row.id } });
    if (row.stripePaymentLink)
      await tx.dealerInvoicePaymentLink.delete({ where: { invoiceId: row.id } });
    await tx.dealerInvoice.delete({ where: { id: row.id } });
  });
}

export async function recordDealerPayment(actorId: string, input: unknown) {
  const data = z
    .object({
      invoiceId: id,
      amountCents: positiveCents,
      date: dateString,
      reference: label,
      evidence: reason,
    })
    .parse(input);
  return phase4(actorId, financeRoles, async (tx) => {
    currentPast(data.date);
    const row = await tx.dealerInvoice.findUnique({
      where: { id: data.invoiceId },
      include: { payments: true, stripePaymentLink: true },
    });
    requireRule(
      row && row.approvedAt && row.state !== "VOIDED",
      "Choose an approved, active invoice.",
    );
    requireRule(
      data.date >= row.issueDate && (!row.sentDate || data.date >= row.sentDate),
      "Payment cannot precede issue/delivery date.",
    );
    const latest = row.payments.reduce((s, p) => (p.date > s ? p.date : s), row.issueDate);
    requireRule(data.date >= latest, "Use a date on or after the latest payment/reversal.");
    requireRule(
      data.amountCents <= row.totalCents - sumCents(row.payments.map((p) => p.amountCents)),
      "Payment exceeds the outstanding invoice.",
    );
    await uniqueReceiptReference(tx, data.reference);
    if (row.stripePaymentLink) await closeInvoicePaymentLink(tx, row.id);
    const payment = await tx.dealerPayment.create({ data: { ...data, createdBy: actorId } });
    await tx.dealerInvoice.update({ where: { id: row.id }, data: { version: { increment: 1 } } });
    await audit(tx, actorId, "DEALER_PAYMENT", payment.id, data);
    return payment;
  });
}
export async function reverseDealerPayment(actorId: string, input: unknown) {
  const data = z.object({ id, date: dateString, reference: label, evidence: reason }).parse(input);
  return phase4(actorId, reviewers, async (tx) => {
    currentPast(data.date);
    const payment = await tx.dealerPayment.findUnique({
      where: { id: data.id },
      include: {
        reversal: true,
        invoice: { include: { payments: true, stripePaymentLink: true } },
      },
    });
    requireRule(
      payment && payment.amountCents > 0 && !payment.reversal && payment.invoice.state !== "VOIDED",
      "Choose an unreversed payment on an active invoice.",
    );
    requireRule(
      !payment.stripeInvoiceId,
      "Refund this Stripe payment in Stripe before recording a reversal.",
    );
    requireRule(
      payment.invoice.payments.every((p) => p.date <= data.date),
      "Reverse on or after the latest payment date.",
    );
    await uniqueReceiptReference(tx, data.reference);
    if (payment.invoice.stripePaymentLink) await closeInvoicePaymentLink(tx, payment.invoiceId);
    const row = await tx.dealerPayment.create({
      data: {
        invoiceId: payment.invoiceId,
        amountCents: -payment.amountCents,
        date: data.date,
        reference: data.reference,
        evidence: data.evidence,
        createdBy: actorId,
        reversesId: payment.id,
      },
    });
    await tx.dealerInvoice.update({
      where: { id: payment.invoiceId },
      data: { version: { increment: 1 } },
    });
    await audit(tx, actorId, "DEALER_PAYMENT_REVERSED", row.id, data);
    return row;
  });
}
export async function recordEntry(actorId: string, input: unknown) {
  const data = z
    .object({
      direction: z.enum(["REVENUE", "EXPENSE"]),
      basis: z.enum(["MANUAL", "ESTIMATE"]),
      category: z.enum(categories),
      amountCents: positiveCents,
      date: dateString,
      reference: label,
      description: label,
      evidence: reason,
      separateRecord: z.literal(true),
    })
    .parse(input);
  return phase4(actorId, financeRoles, async (tx) => {
    currentPast(data.date);
    await uniqueReceiptReference(tx, data.reference);
    const entry = {
      direction: data.direction,
      basis: data.basis,
      category: data.category,
      amountCents: data.amountCents,
      date: data.date,
      reference: data.reference,
      description: data.description,
      evidence: data.evidence,
    };
    const row = await tx.financeEntry.create({ data: { ...entry, createdBy: actorId } });
    await audit(tx, actorId, "FINANCE_ENTRY", row.id, data);
    return row;
  });
}
export async function reviewEntry(actorId: string, input: unknown) {
  const data = z.object({ id, version, decision: z.enum(["VERIFY", "VOID"]), reason }).parse(input);
  return phase4(actorId, reviewers, async (tx) => {
    const row = await tx.financeEntry.findUnique({ where: { id: data.id } });
    requireRule(
      row?.version === data.version && !row.voidDate,
      "Entry changed or is voided. Refresh and review it.",
    );
    if (data.decision === "VERIFY") {
      requireRule(
        row.basis === "MANUAL" && !row.verifiedAt && row.createdBy !== actorId,
        "A different owner or manager may verify a manual entry against evidence. Estimates cannot be verified.",
      );
      await tx.financeEntry.update({
        where: { id: row.id },
        data: { verifiedAt: new Date(), verifiedBy: actorId, version: { increment: 1 } },
      });
    } else
      await tx.financeEntry.update({
        where: { id: row.id },
        data: { voidDate: businessDate(), voidReason: data.reason, version: { increment: 1 } },
      });
    await audit(tx, actorId, `FINANCE_ENTRY_${data.decision}`, row.id, data);
  });
}
export async function dealerOverview(
  actorId: string,
  query = "",
  scope: "active" | "all" | "archived" = "active",
) {
  const search = z.string().max(160).parse(query);
  return readAsActor(actorId, financeRoles, async (tx) => {
    const asOf = businessDate();
    const dealers = await tx.dealership.findMany({
      where: {
        ...(scope === "all" ? {} : { active: scope === "active" }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                {
                  contacts: {
                    some: {
                      active: true,
                      OR: [
                        { name: { contains: search, mode: "insensitive" } },
                        { email: { contains: search, mode: "insensitive" } },
                        { phone: { contains: search, mode: "insensitive" } },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      take: 100,
      include: {
        contacts: { where: { active: true }, orderBy: { createdAt: "asc" } },
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { payments: { where: { date: { lte: asOf } } } },
        },
      },
    });
    const balances = await dealerOutstandingBalances(
      tx,
      dealers.map((dealer) => dealer.id),
      asOf,
    );
    return {
      dealers: dealers.map((dealer) => {
        const latest = dealer.invoices[0];
        const summary = latest
          ? receivable(
              { ...latest, state: latest.approvedAt ? latest.state : "DRAFT" },
              latest.payments,
              asOf,
            )
          : null;
        return {
          id: dealer.id,
          name: dealer.name,
          active: dealer.active,
          phone: dealer.phone,
          email: dealer.email,
          contacts: dealer.contacts,
          outstandingCents: balances.get(dealer.id) ?? 0,
          latestInvoice: latest
            ? {
                id: latest.id,
                number: latest.number,
                status: summary!.status,
                totalCents: latest.totalCents,
              }
            : null,
        };
      }),
      demo: (await tx.employee.count({ where: { demo: true } })) > 0,
    };
  });
}

async function dealerOutstandingBalances(tx: Tx, dealershipIds: string[], asOf: string) {
  const balances = new Map(dealershipIds.map((dealerId) => [dealerId, 0]));
  if (!dealershipIds.length) return balances;
  const invoices = await tx.dealerInvoice.findMany({
    where: {
      dealershipId: { in: dealershipIds },
      issueDate: { lte: asOf },
      state: { not: "DRAFT" },
      OR: [{ voidDate: null }, { voidDate: { gt: asOf } }],
    },
    select: {
      dealershipId: true,
      state: true,
      totalCents: true,
      dueDate: true,
      issueDate: true,
      voidDate: true,
      payments: {
        where: { date: { lte: asOf } },
        select: { amountCents: true, date: true },
      },
    },
  });
  for (const invoice of invoices) {
    const summary = receivable(invoice, invoice.payments, asOf);
    if (summary.recognized)
      balances.set(
        invoice.dealershipId,
        (balances.get(invoice.dealershipId) ?? 0) + summary.remainingCents,
      );
  }
  return balances;
}

export async function dealerDetail(actorId: string, key: string) {
  return readAsActor(actorId, financeRoles, async (tx) => {
    const dealerId = id.parse(key);
    const [unbilledRows, dealer] = await Promise.all([
      tx.dealerService.findMany({
        where: { dealershipId: dealerId, invoiceId: null, voidDate: null },
        orderBy: [{ date: "asc" }, { id: "asc" }],
        take: 100,
      }),
      tx.dealership.findUnique({
        where: { id: id.parse(key) },
        include: {
          contacts: { orderBy: { createdAt: "asc" } },
          services: {
            orderBy: [{ date: "desc" }, { id: "asc" }],
            take: 100,
            include: { invoice: { select: { id: true, number: true } } },
          },
          invoices: { orderBy: { createdAt: "desc" }, take: 100, include: { payments: true } },
          virRecords: {
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            take: 100,
            select: {
              id: true,
              date: true,
              certificate: true,
              testNumber: true,
              outcome: true,
              billing: true,
              serviceId: true,
            },
          },
        },
      }),
    ]);
    const virCounts = unbilledRows.length
      ? await tx.dealerVirRecord.groupBy({
          by: ["serviceId"],
          where: { serviceId: { in: unbilledRows.map((service) => service.id) } },
          _count: { _all: true },
        })
      : [];
    const virCountsByService = new Map(virCounts.map((item) => [item.serviceId, item._count._all]));
    const unbilled = unbilledRows.map((service) => ({
      ...service,
      virReportCount: virCountsByService.get(service.id) ?? 0,
    }));
    const asOf = businessDate();
    const balances = await dealerOutstandingBalances(tx, dealer ? [dealer.id] : [], asOf);
    return {
      unbilled,
      dealer: dealer ? { ...dealer, outstandingCents: balances.get(dealer.id) ?? 0 } : null,
      demo: (await tx.employee.count({ where: { demo: true } })) > 0,
    };
  });
}
export async function invoiceOverview(
  actorId: string,
  query = "",
  scope: "active" | "archived" = "active",
) {
  const search = z.string().max(160).parse(query);
  return readAsActor(actorId, financeRoles, async (tx) => ({
    invoices: await tx.dealerInvoice.findMany({
      where: {
        archivedAt: scope === "archived" ? { not: null } : null,
        ...(search
          ? {
              OR: [
                { number: { contains: search, mode: "insensitive" } },
                { dealership: { name: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { dealership: { select: { name: true } }, payments: true },
    }),
    demo: (await tx.employee.count({ where: { demo: true } })) > 0,
  }));
}
export async function paymentOverview(actorId: string, query = "") {
  const search = z.string().max(160).parse(query);
  return readAsActor(actorId, financeRoles, async (tx) => ({
    payments: await tx.dealerPayment.findMany({
      where: search
        ? {
            OR: [
              { reference: { contains: search, mode: "insensitive" } },
              { invoice: { number: { contains: search, mode: "insensitive" } } },
              {
                invoice: {
                  dealership: { name: { contains: search, mode: "insensitive" } },
                },
              },
            ],
          }
        : {},
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        invoice: { select: { number: true, dealership: { select: { name: true } } } },
        reversal: true,
      },
    }),
    demo: (await tx.employee.count({ where: { demo: true } })) > 0,
  }));
}
export async function invoiceDetail(actorId: string, key: string) {
  return readAsActor(actorId, financeRoles, async (tx) => ({
    invoice: await tx.dealerInvoice.findUnique({
      where: { id: id.parse(key) },
      include: {
        lines: { orderBy: [{ date: "asc" }, { id: "asc" }] },
        payments: { orderBy: { createdAt: "asc" }, include: { reversal: true } },
        stripePaymentLink: true,
        emailResends: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    history: await tx.auditLog.findMany({
      where: { entityId: key },
      orderBy: { createdAt: "asc" },
      select: { id: true, action: true, createdAt: true, actor: { select: { name: true } } },
    }),
    demo: (await tx.employee.count({ where: { demo: true } })) > 0,
  }));
}
export async function report(tx: Tx, start: string, end: string) {
  const invoices = await tx.dealerInvoice.findMany({
    where: { issueDate: { lte: end } },
    include: { dealership: { select: { name: true, code: true } }, payments: true },
    orderBy: { number: "asc" },
  });
  // No pagination before totals: reports/exports include every matching record.
  const aging = invoices
    .map((i) => ({
      ...i,
      ...receivable({ ...i, state: i.approvedAt ? i.state : "DRAFT" }, i.payments, end),
    }))
    .filter((i) => i.recognized && i.remainingCents > 0);
  const dealerPayments = await tx.dealerPayment.findMany({
    where: { date: { gte: start, lte: end } },
    include: { invoice: { select: { number: true } } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
  const rentalPayments = await tx.rentalPayment.findMany({
    where: { date: { gte: start, lte: end } },
    include: { charge: { include: { agreement: { select: { tenant: true, reference: true } } } } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
  const entries = await tx.financeEntry.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: [{ date: "desc" }, { id: "asc" }],
  });
  const active = entries.filter((e) => !e.voidDate || e.voidDate > end);
  const total = (
    direction: "REVENUE" | "EXPENSE",
    basis: "MANUAL" | "ESTIMATE",
    verified: boolean,
  ) =>
    sumCents(
      active
        .filter(
          (e) =>
            e.direction === direction &&
            e.basis === basis &&
            (basis === "ESTIMATE" || !!e.verifiedAt === verified),
        )
        .map((e) => e.amountCents),
    );
  return {
    invoices: invoices.filter((i) => i.issueDate >= start),
    aging,
    dealerPayments,
    rentalPayments,
    entries,
    totals: {
      dealerReceipts: sumCents(dealerPayments.map((p) => p.amountCents)),
      rentalReceipts: sumCents(rentalPayments.map((p) => p.amountCents)),
      outstanding: sumCents(aging.map((i) => i.remainingCents)),
      billed: sumCents(
        invoices
          .filter((i) => i.issueDate >= start && i.approvedAt && (!i.voidDate || i.voidDate > end))
          .map((i) => i.totalCents),
      ),
      manualRevenue: total("REVENUE", "MANUAL", false),
      verifiedRevenue: total("REVENUE", "MANUAL", true),
      manualExpense: total("EXPENSE", "MANUAL", false),
      verifiedExpense: total("EXPENSE", "MANUAL", true),
      estimatedRevenue: total("REVENUE", "ESTIMATE", false),
      estimatedExpense: total("EXPENSE", "ESTIMATE", false),
    },
  };
}
export async function financeReport(actorId: string, input: unknown) {
  const range = reportRange.parse(input);
  currentPast(range.end);
  return readAsActor(actorId, financeRoles, async (tx) => ({
    ...(await report(tx, range.start, range.end)),
    ...range,
    demo: (await tx.employee.count({ where: { demo: true } })) > 0,
  }));
}
export const datasets = [
  "invoices",
  "invoice-lines",
  "dealer-payments",
  "rental-payments",
  "entries",
  "aging",
] as const;
export async function exportFinance(actorId: string, input: unknown) {
  const data = reportRange.and(z.object({ dataset: z.enum(datasets) })).parse(input);
  currentPast(data.end);
  return phase4(actorId, financeRoles, async (tx) => {
    const r = await report(tx, data.start, data.end);
    let rows: (string | number | null)[][];
    if (data.dataset === "invoices")
      rows = [
        [
          "id",
          "number",
          "dealer_code",
          "issue_date",
          "due_date",
          "status_as_of",
          "subtotal_cents",
          "tax_bps",
          "tax_cents",
          "total_cents",
          "paid_cents_as_of",
          "outstanding_cents_as_of",
          "currency",
          "approved_by",
          "delivery_reference",
          "void_date",
          "billing_name_snapshot",
          "billing_address_snapshot",
          "terms_reference_snapshot",
        ],
        ...r.invoices.map((i) => {
          const s = receivable(
            { ...i, state: i.approvedAt ? i.state : "DRAFT" },
            i.payments,
            data.end,
          );
          return [
            i.id,
            i.number,
            (i.snapshot as { code: string }).code,
            i.issueDate,
            i.dueDate,
            s.status,
            i.subtotalCents,
            i.taxBps,
            i.taxCents,
            i.totalCents,
            s.paidCents,
            s.remainingCents,
            "USD",
            i.approvedBy,
            i.deliveryReference,
            i.voidDate,
            (i.snapshot as { name: string }).name,
            (i.snapshot as { billingAddress: string }).billingAddress,
            (i.snapshot as { termsReference: string }).termsReference,
          ];
        }),
      ];
    else if (data.dataset === "invoice-lines") {
      const lines = await tx.dealerInvoiceLine.findMany({
        where: { invoice: { issueDate: { gte: data.start, lte: data.end } } },
        include: { invoice: { select: { number: true, state: true } } },
        orderBy: [{ invoiceId: "asc" }, { id: "asc" }],
      });
      rows = [
        [
          "line_id",
          "invoice_number",
          "invoice_state",
          "service_id",
          "service_date",
          "description",
          "quantity",
          "unit_cents",
          "amount_cents",
          "currency",
        ],
        ...lines.map((l) => [
          l.id,
          l.invoice.number,
          l.invoice.state,
          l.serviceId,
          l.date,
          l.description,
          l.quantity,
          l.unitCents,
          l.amountCents,
          "USD",
        ]),
      ];
    } else if (data.dataset === "dealer-payments")
      rows = [
        [
          "id",
          "invoice_number",
          "date",
          "signed_amount_cents",
          "currency",
          "reference",
          "evidence",
          "reverses_id",
          "entered_by",
          "provenance",
        ],
        ...r.dealerPayments.map((p) => [
          p.id,
          p.invoice.number,
          p.date,
          p.amountCents,
          "USD",
          p.reference,
          p.evidence,
          p.reversesId,
          p.createdBy,
          "MANUAL_RECEIPT_RECORD",
        ]),
      ];
    else if (data.dataset === "rental-payments")
      rows = [
        [
          "id",
          "agreement_reference",
          "tenant",
          "charge_month",
          "date",
          "signed_amount_cents",
          "currency",
          "reference",
          "reason",
          "reverses_id",
          "entered_by",
          "provenance",
        ],
        ...r.rentalPayments.map((p) => [
          p.id,
          p.charge.agreement.reference,
          p.charge.agreement.tenant,
          p.charge.month,
          p.date,
          p.amountCents,
          "USD",
          p.reference,
          p.reason,
          p.reversesId,
          p.createdBy,
          "MANUAL_RECEIPT_RECORD",
        ]),
      ];
    else if (data.dataset === "entries")
      rows = [
        [
          "id",
          "date",
          "direction",
          "category",
          "amount_cents",
          "currency",
          "basis",
          "verified_by",
          "verified_at",
          "reference",
          "description",
          "evidence",
          "void_date",
          "void_reason",
          "entered_by",
        ],
        ...r.entries.map((e) => [
          e.id,
          e.date,
          e.direction,
          e.category,
          e.amountCents,
          "USD",
          e.basis,
          e.verifiedBy,
          e.verifiedAt?.toISOString() ?? null,
          e.reference,
          e.description,
          e.evidence,
          e.voidDate,
          e.voidReason,
          e.createdBy,
        ]),
      ];
    else
      rows = [
        [
          "as_of",
          "invoice_id",
          "invoice_number",
          "dealer_code",
          "dealer_name",
          "due_date",
          "days_past_due",
          "bucket",
          "outstanding_cents",
          "currency",
        ],
        ...r.aging.map((i) => [
          data.end,
          i.id,
          i.number,
          i.dealership.code,
          i.dealership.name,
          i.dueDate,
          i.days,
          i.bucket,
          i.remainingCents,
          "USD",
        ]),
      ];
    await audit(tx, actorId, "FINANCE_EXPORT", data.dataset, { ...data, rows: rows.length - 1 });
    return csv(rows);
  });
}
