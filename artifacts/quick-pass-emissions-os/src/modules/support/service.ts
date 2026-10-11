import { Prisma, type Role } from "@prisma/client";
import { businessDate } from "@/lib/time";
import { id } from "@/lib/validation";
import { phase3, managers, audit, requireRule, type Tx } from "../phase3";
import { activeVendor } from "../maintenance/service";
import * as r from "./rules";

// Directory contact fields displayed to owners and management.
export const operationalSelect = {
  id: true,
  name: true,
  contact: true,
  phone: true,
  email: true,
  active: true,
  version: true,
  verifiedDate: true,
  categories: true,
  extension: true,
  alternateContact: true,
  alternatePhone: true,
  alternateExtension: true,
  alternateEmail: true,
  website: true,
  supportUrl: true,
  hours: true,
  emergencyDetails: true,
  emergencyPhone: true,
  operationalInstructions: true,
  supportedServices: true,
  sourceReference: true,
  lastConfirmedDate: true,
  preferences: { select: { category: true } },
} satisfies Prisma.VendorSelect;
function current(row: { version: number } | null, version: number) {
  requireRule(row?.version === version, "This record changed. Refresh and try again.");
}
async function ticketAccess(tx: Tx, actor: { role: Role }, ticketId: string) {
  const ticket = await tx.maintenanceTicket.findUnique({ where: { id: ticketId } });
  requireRule(ticket && managers.includes(actor.role), "Access denied to this maintenance ticket.");
  return ticket;
}
export async function directory(
  actorId: string,
  query: { search?: string; category?: string; archived?: boolean } = {},
) {
  const search = (query.search ?? "").trim().slice(0, 160);
  const category = query.category ? r.category.parse(query.category) : null;
  return phase3(actorId, managers, async (tx) => {
    const providers = await tx.vendor.findMany({
      where: {
        ...(query.archived ? {} : { active: true }),
        ...(category ? { categories: { has: category } } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { contact: { contains: search, mode: "insensitive" } },
                { alternateContact: { contains: search, mode: "insensitive" } },
                { services: { contains: search, mode: "insensitive" } },
                { supportedServices: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: operationalSelect,
      orderBy: { name: "asc" },
    });
    return {
      management: true,
      providers,
      preferenceChoices: await tx.vendor.findMany({
        where: { active: true, verifiedDate: { not: null } },
        select: { id: true, name: true, categories: true },
        orderBy: { name: "asc" },
      }),
      preferences: await tx.supportPreference.findMany({
        select: { category: true, vendorId: true, version: true },
      }),
      demo: (await tx.employee.count({ where: { demo: true } })) > 0,
    };
  });
}
export async function providerDetail(actorId: string, vendorId: string) {
  return phase3(actorId, managers, async (tx) => {
    const provider = await tx.vendor.findUnique({
      where: { id: id.parse(vendorId) },
      select: operationalSelect,
    });
    requireRule(provider, "Provider not found.");
    const history = await tx.supportContactHistory.findMany({
      where: { vendorId },
      select: {
        id: true,
        actorName: true,
        contactedAt: true,
        method: true,
        outcome: true,
        reference: true,
        followUpDate: true,
        ticketId: true,
        equipmentId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return {
      management: true,
      provider,
      history,
      privateProvider: await tx.vendor.findUnique({ where: { id: vendorId } }),
      associations: await tx.supportAssociation.findMany({
        where: { vendorId },
        include: {
          equipment: { select: { id: true, name: true } },
          bay: { select: { id: true, identifier: true } },
        },
      }),
      equipment: await tx.equipment.findMany({
        where: { active: true },
        select: { id: true, name: true },
      }),
      bays: await tx.carwashBay.findMany({ select: { id: true, identifier: true } }),
      tickets: await tx.maintenanceTicket.findMany({
        where: {},
        select: { id: true, title: true },
        orderBy: { createdAt: "desc" },
      }),
    };
  });
}
export async function saveDirectory(actorId: string, raw: unknown) {
  const { id: vendorId, version, reason, ...data } = r.saveInput.parse(raw);
  return phase3(actorId, managers, async (tx) => {
    const before = await tx.vendor.findUnique({ where: { id: vendorId } });
    current(before, version);
    requireRule(
      !data.lastConfirmedDate || (before!.verifiedDate && data.lastConfirmedDate <= businessDate()),
      "Confirm a verified contact on a real current/past date.",
    );
    const prefs = await tx.supportPreference.findMany({ where: { vendorId } });
    requireRule(
      !prefs.some((p) => !data.categories.includes(p.category as (typeof r.CATEGORIES)[number])),
      "Remove the category preference explicitly before removing its category.",
    );
    const row = await tx.vendor.update({
      where: { id: vendorId },
      data: { ...data, version: { increment: 1 } },
    });
    await audit(tx, actorId, "SUPPORT_DETAILS_SAVED", vendorId, { before, after: data, reason });
    return row;
  });
}
export async function setProviderStatus(actorId: string, raw: unknown) {
  const data = r.statusInput.parse(raw);
  return phase3(actorId, managers, async (tx) => {
    const before = await tx.vendor.findUnique({ where: { id: data.id } });
    current(before, data.version);
    const row = await tx.vendor.update({
      where: { id: data.id },
      data: {
        active: data.active,
        version: { increment: 1 },
      },
    });
    await audit(tx, actorId, "SUPPORT_STATUS_CHANGED", row.id, {
      before: before!.active,
      active: row.active,
      reason: data.reason,
    });
    return row;
  });
}
export async function setPreference(actorId: string, raw: unknown) {
  const data = r.preferenceInput.parse(raw);
  return phase3(actorId, managers, async (tx) => {
    const before = await tx.supportPreference.findUnique({ where: { category: data.category } });
    requireRule((before?.version ?? 0) === data.version, "Preference changed. Refresh first.");
    if (data.vendorId) {
      await activeVendor(tx, data.vendorId);
      const vendor = await tx.vendor.findUnique({ where: { id: data.vendorId } });
      requireRule(
        vendor!.categories.includes(data.category),
        "Provider must support this category.",
      );
      await tx.supportPreference.upsert({
        where: { category: data.category },
        create: { category: data.category, vendorId: data.vendorId, version: 1 },
        update: { vendorId: data.vendorId, version: { increment: 1 } },
      });
    } else {
      requireRule(before, "No preference is configured.");
      await tx.supportPreference.update({
        where: { category: data.category },
        data: {
          vendorId: null,
          version: { increment: 1 },
        },
      });
    }
    await audit(tx, actorId, "SUPPORT_PREFERENCE_CHANGED", data.category, { before, after: data });
  });
}
export async function associateSupport(actorId: string, raw: unknown) {
  const data = r.associationInput.parse(raw);
  return phase3(actorId, managers, async (tx) => {
    const vendor = await tx.vendor.findUnique({ where: { id: data.vendorId } });
    current(vendor, data.version);
    if (!data.remove) {
      await activeVendor(tx, data.vendorId);
      if (data.equipmentId)
        requireRule(
          (await tx.equipment.findUnique({ where: { id: data.equipmentId } }))?.active,
          "Choose active equipment.",
        );
      if (data.bayId)
        requireRule(
          await tx.carwashBay.findUnique({ where: { id: data.bayId } }),
          "Choose a configured bay.",
        );
    }
    const where = { vendorId: data.vendorId, equipmentId: data.equipmentId, bayId: data.bayId };
    if (data.remove) await tx.supportAssociation.deleteMany({ where });
    else if (!(await tx.supportAssociation.findFirst({ where })))
      await tx.supportAssociation.create({ data: where });
    await tx.vendor.update({ where: { id: data.vendorId }, data: { version: { increment: 1 } } });
    await audit(tx, actorId, "SUPPORT_ASSOCIATION_CHANGED", data.vendorId, data);
  });
}
export async function selectTicketProvider(actorId: string, raw: unknown) {
  const data = r.ticketProviderInput.parse(raw);
  return phase3(actorId, managers, async (tx, actor) => {
    const ticket = await ticketAccess(tx, actor, data.id);
    current(ticket, data.version);
    requireRule(
      !["COMPLETED", "CANCELLED"].includes(ticket.status),
      "Closed tickets retain history.",
    );
    await activeVendor(tx, data.vendorId);
    await tx.maintenanceTicket.update({
      where: { id: data.id },
      data: { vendorId: data.vendorId, version: { increment: 1 } },
    });
    await tx.maintenanceEvent.create({
      data: {
        ticketId: data.id,
        actorId,
        action: "PROVIDER_ASSOCIATED",
        details: { before: ticket.vendorId, vendorId: data.vendorId, reason: data.reason },
      },
    });
    await audit(tx, actorId, "SUPPORT_TICKET_PROVIDER", data.id, data);
  });
}
export async function logContact(actorId: string, raw: unknown) {
  const data = r.historyInput.parse(raw);
  return phase3(actorId, managers, async (tx, actor) => {
    const vendor = await tx.vendor.findUnique({ where: { id: data.vendorId } });
    requireRule(vendor?.active, "Choose an active provider for a new contact entry.");
    requireRule(
      new Date(data.contactedAt).getTime() <= Date.now(),
      "Contact time cannot be in the future.",
    );
    const ticket = data.ticketId ? await ticketAccess(tx, actor, data.ticketId) : null;
    if (data.equipmentId) {
      requireRule(
        await tx.equipment.findUnique({ where: { id: data.equipmentId } }),
        "Equipment not found.",
      );
      requireRule(
        !ticket || ticket.equipmentId === data.equipmentId,
        "Equipment and ticket must refer to the same target.",
      );
    }
    const name = await tx.user.findUnique({ where: { id: actorId }, select: { name: true } });
    const row = await tx.supportContactHistory.create({
      data: { ...data, contactedAt: new Date(data.contactedAt), actorId, actorName: name!.name },
    });
    // Narrative is restricted to management history, not ordinary audit exports.
    await audit(tx, actorId, "SUPPORT_CONTACT_SELF_REPORTED", row.id, {
      vendorId: data.vendorId,
      method: data.method,
    });
    return row;
  });
}
// Context reads retain the original manager-only equipment/bay boundary.
export async function targetProviders(
  actorId: string,
  target: { equipmentId?: string; bayId?: string },
) {
  return phase3(actorId, managers, async (tx) => {
    const associations = await tx.supportAssociation.findMany({
      where: target.equipmentId
        ? { equipmentId: id.parse(target.equipmentId) }
        : { bayId: id.parse(target.bayId) },
      select: { vendor: { select: { id: true, name: true, active: true } } },
    });
    return associations.map((a) => a.vendor);
  });
}
export async function ticketSupport(actorId: string, ticketId: string) {
  return phase3(actorId, managers, async (tx, actor) => {
    const ticket = await ticketAccess(tx, actor, id.parse(ticketId));
    const assigned = ticket.vendorId
      ? await tx.vendor.findUnique({
          where: { id: ticket.vendorId },
          select: { id: true, name: true, active: true },
        })
      : null;
    const associated = await tx.supportAssociation.findMany({
      where: ticket.equipmentId ? { equipmentId: ticket.equipmentId } : { bayId: ticket.bayId },
      select: { vendor: { select: { id: true, name: true, active: true } } },
    });
    return {
      assigned,
      relevant: associated.map((a) => a.vendor),
      choices: await tx.vendor.findMany({
        where: { active: true, verifiedDate: { not: null } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    };
  });
}
