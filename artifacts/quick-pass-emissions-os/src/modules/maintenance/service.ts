import { z } from "zod";
import { id, dateString } from "../../lib/validation";
import { businessDate, dueInstant } from "../../lib/time";
import { phase3, managers, requireRule, audit, type Tx } from "../phase3";
import * as v from "./validation";
export async function activeEmployee(tx: Tx, employeeId: string | null) {
  if (!employeeId) return;
  const row = await tx.employee.findUnique({ where: { id: employeeId }, include: { user: true } });
  requireRule(
    row?.user.active && row.user.role !== "BOOKKEEPER",
    "Choose an active operations employee.",
  );
}
export async function activeVendor(tx: Tx, vendorId: string | null) {
  if (vendorId) {
    const vendor = await tx.vendor.findUnique({ where: { id: vendorId } });
    requireRule(vendor?.active && vendor.verifiedDate, "Choose an active verified vendor.");
  }
}
export async function validTarget(tx: Tx, bayId: string | null, equipmentId: string | null) {
  if (bayId)
    requireRule(
      await tx.carwashBay.findUnique({ where: { id: bayId } }),
      "Choose a configured bay.",
    );
  if (equipmentId)
    requireRule(
      (await tx.equipment.findUnique({ where: { id: equipmentId } }))?.active,
      "Choose active equipment.",
    );
}
function current(row: { version: number } | null, version: number) {
  requireRule(row && row.version === version, "This record changed. Refresh and try again.");
}
export async function configureBays(actorId: string, input: unknown) {
  const data = v.layoutInput.parse(input);
  return phase3(actorId, ["OWNER"], async (tx) => {
    requireRule(!(await tx.carwashBay.count()), "The six-bay layout is already configured.");
    for (let slot = 1; slot <= 6; slot++)
      await tx.carwashBay.create({
        data: {
          slot,
          identifier: data.identifiers[slot - 1],
          type: slot <= 3 ? "SELF_SERVICE" : "DETAILING",
        },
      });
    await audit(tx, actorId, "BAYS_CONFIGURED", "bays", data);
  });
}
export async function updateBay(actorId: string, input: unknown) {
  const data = v.bayInput.parse(input);
  return phase3(actorId, managers, async (tx, actor) => {
    const before = await tx.carwashBay.findUnique({ where: { id: data.id } });
    current(before, data.version);
    if (data.identifier && data.identifier !== before!.identifier) {
      requireRule(actor.role === "OWNER", "Only the owner may change bay identifiers.");
      requireRule(
        !(await tx.carwashBay.count({
          where: {
            id: { not: data.id },
            identifier: { equals: data.identifier, mode: "insensitive" },
          },
        })),
        "Bay identifier already exists.",
      );
    }
    await activeEmployee(tx, data.responsibleId);
    const offline = ["OUT_OF_SERVICE", "UNDER_REPAIR"].includes(data.status);
    const open = await tx.downtimeEvent.findFirst({ where: { bayId: data.id, endedAt: null } });
    const now = new Date();
    if (offline && !open)
      await tx.downtimeEvent.create({
        data: { bayId: data.id, startedAt: now, reason: data.reason, createdBy: actorId },
      });
    if (!offline && open)
      await tx.downtimeEvent.update({
        where: { id: open.id },
        data: { endedAt: now, resolution: data.reason, closedBy: actorId },
      });
    const row = await tx.carwashBay.update({
      where: { id: data.id },
      data: {
        ...(data.identifier ? { identifier: data.identifier } : {}),
        status: data.status,
        responsibleId: data.responsibleId,
        notes: data.notes,
        version: { increment: 1 },
      },
    });
    await audit(tx, actorId, "BAY_UPDATED", row.id, {
      before: {
        identifier: before!.identifier,
        status: before!.status,
        responsibleId: before!.responsibleId,
        notes: before!.notes,
      },
      after: data,
    });
    return row;
  });
}
export async function saveVendor(actorId: string, input: unknown) {
  const data = v.vendorInput.parse(input);
  return phase3(actorId, managers, (tx) => saveVendorInTransaction(tx, actorId, data));
}
// Shared mutation boundary for validated manual records and unverified imported references.
export async function saveVendorInTransaction(tx: Tx, actorId: string, input: unknown) {
  const { id: recordId, version, reason, ...data } = v.vendorReferenceInput.parse(input);
  if (data.verifiedDate)
    requireRule(data.verifiedDate <= businessDate(), "Verification date cannot be in the future.");
  const before = recordId ? await tx.vendor.findUnique({ where: { id: recordId } }) : null;
  if (recordId) current(before, version);
  const row = recordId
    ? await tx.vendor.update({
        where: { id: recordId },
        data: { ...data, version: { increment: 1 } },
      })
    : await tx.vendor.create({ data });
  await audit(tx, actorId, "VENDOR_SAVED", row.id, { before, after: data, reason });
  return row;
}
export async function saveEquipment(actorId: string, input: unknown) {
  const { id: recordId, version, reason, ...data } = v.equipmentInput.parse(input);
  return phase3(actorId, managers, async (tx) => {
    const before = recordId ? await tx.equipment.findUnique({ where: { id: recordId } }) : null;
    if (recordId) current(before, version);
    await validTarget(tx, data.bayId, null);
    await activeVendor(tx, data.vendorId);
    requireRule(
      !(await tx.equipment.count({
        where: { code: data.code, ...(recordId ? { id: { not: recordId } } : {}) },
      })),
      "Equipment code already exists.",
    );
    if (recordId && !data.active) {
      const [tickets, plans, down] = await Promise.all([
        tx.maintenanceTicket.count({
          where: { equipmentId: recordId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
        }),
        tx.maintenancePlan.count({ where: { equipmentId: recordId, active: true } }),
        tx.downtimeEvent.count({ where: { equipmentId: recordId, endedAt: null } }),
      ]);
      requireRule(
        !tickets && !plans && !down,
        "Close open work and downtime and pause plans before archiving equipment.",
      );
    }
    const row = recordId
      ? await tx.equipment.update({
          where: { id: recordId },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.equipment.create({ data });
    await audit(tx, actorId, "EQUIPMENT_SAVED", row.id, { before, after: data, reason });
    return row;
  });
}
export async function equipmentDowntime(actorId: string, input: unknown) {
  const data = z
    .object({ id, version: v.version, decision: z.enum(["START", "END"]), reason: v.reason })
    .parse(input);
  return phase3(actorId, managers, async (tx) => {
    const equipment = await tx.equipment.findUnique({ where: { id: data.id } });
    current(equipment, data.version);
    requireRule(equipment!.active, "Archived equipment cannot record downtime.");
    const open = await tx.downtimeEvent.findFirst({
      where: { equipmentId: data.id, endedAt: null },
    });
    if (data.decision === "START") {
      requireRule(!open, "Downtime is already open.");
      await tx.downtimeEvent.create({
        data: {
          equipmentId: data.id,
          startedAt: new Date(),
          reason: data.reason,
          createdBy: actorId,
        },
      });
    } else {
      requireRule(open, "There is no open downtime event.");
      await tx.downtimeEvent.update({
        where: { id: open.id },
        data: { endedAt: new Date(), resolution: data.reason, closedBy: actorId },
      });
    }
    await tx.equipment.update({ where: { id: data.id }, data: { version: { increment: 1 } } });
    await audit(tx, actorId, "EQUIPMENT_DOWNTIME", data.id, data);
  });
}
export async function createTicket(actorId: string, input: unknown) {
  return phase3(actorId, managers, async (tx) => {
    const data = v.ticketInput.parse(input);
    await validTarget(tx, data.bayId, data.equipmentId);
    await activeEmployee(tx, data.assignedId);
    await activeVendor(tx, data.vendorId);
    const row = await tx.maintenanceTicket.create({
      data: { ...data, dueAt: dueInstant(data.targetDate, "17:00"), reportedBy: actorId },
    });
    await tx.maintenanceEvent.create({
      data: {
        ticketId: row.id,
        actorId,
        action: "REPORTED",
        details: { title: data.title, description: data.description },
      },
    });
    await audit(tx, actorId, "MAINTENANCE_REPORTED", row.id, data);
    return row;
  });
}
export async function updateTicket(actorId: string, input: unknown) {
  return phase3(actorId, managers, async (tx) => {
    const data = z
      .object({
        id,
        version: v.version,
        status: z.enum([
          "OPEN",
          "IN_PROGRESS",
          "BLOCKED",
          "AWAITING_REVIEW",
          "COMPLETED",
          "CANCELLED",
        ]),
        workPerformed: v.notes,
        reason: v.reason,
      })
      .parse(input);
    const row = await tx.maintenanceTicket.findUnique({ where: { id: data.id } });
    current(row, data.version);
    requireRule(
      row!.status !== "COMPLETED" && row!.status !== "CANCELLED",
      "Closed tickets retain history. Create a follow-up ticket.",
    );
    requireRule(data.status !== row!.status, "Choose a different work status.");
    if (["AWAITING_REVIEW", "COMPLETED"].includes(data.status))
      requireRule(data.workPerformed.trim(), "Describe the work performed before completing work.");
    const management = z
      .object({
        assignedId: v.optionalId,
        vendorId: v.optionalId,
        targetDate: dateString,
        repairCostCents: v.optionalCents,
      })
      .parse(input);
    await activeEmployee(tx, management.assignedId);
    await activeVendor(tx, management.vendorId);
    const changed = await tx.maintenanceTicket.update({
      where: { id: data.id },
      data: {
        status: data.status,
        workPerformed: data.workPerformed,
        ...management,
        dueAt:
          management.targetDate === row!.targetDate
            ? row!.dueAt
            : dueInstant(management.targetDate, "17:00"),
        completedAt: data.status === "COMPLETED" ? new Date() : null,
        reviewedBy: data.status === "COMPLETED" ? actorId : null,
        version: { increment: 1 },
      },
    });
    await tx.notification.updateMany({
      where: { maintenanceId: data.id, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
    await tx.maintenanceEvent.create({
      data: {
        ticketId: row!.id,
        actorId,
        action: data.status,
        details: {
          before: {
            status: row!.status,
            assignedId: row!.assignedId,
            vendorId: row!.vendorId,
            targetDate: row!.targetDate,
            repairCostCents: row!.repairCostCents,
            workPerformed: row!.workPerformed,
          },
          after: { ...data, ...management },
        },
      },
    });
    await audit(tx, actorId, "MAINTENANCE_UPDATED", row!.id, { ...data, ...management });
    return changed;
  });
}
export async function assignTicket(actorId: string, input: unknown) {
  const data = z
    .object({
      id,
      version: v.version,
      assignedId: v.optionalId,
      vendorId: v.optionalId,
      targetDate: dateString,
      reason: v.reason,
    })
    .parse(input);
  return phase3(actorId, managers, async (tx) => {
    const row = await tx.maintenanceTicket.findUnique({ where: { id: data.id } });
    current(row, data.version);
    requireRule(
      row!.status !== "COMPLETED" && row!.status !== "CANCELLED",
      "Closed tickets retain history.",
    );
    await activeEmployee(tx, data.assignedId);
    await activeVendor(tx, data.vendorId);
    const updated = await tx.maintenanceTicket.update({
      where: { id: data.id },
      data: {
        assignedId: data.assignedId,
        vendorId: data.vendorId,
        targetDate: data.targetDate,
        dueAt:
          data.targetDate === row!.targetDate ? row!.dueAt : dueInstant(data.targetDate, "17:00"),
        version: { increment: 1 },
      },
    });
    await tx.notification.updateMany({
      where: { maintenanceId: data.id, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
    await tx.maintenanceEvent.create({
      data: {
        ticketId: data.id,
        actorId,
        action: "ASSIGNED",
        details: {
          before: {
            assignedId: row!.assignedId,
            vendorId: row!.vendorId,
            targetDate: row!.targetDate,
          },
          after: data,
        },
      },
    });
    await audit(tx, actorId, "MAINTENANCE_ASSIGNED", data.id, data);
    return updated;
  });
}
export async function savePlan(actorId: string, input: unknown) {
  const { id: recordId, version, reason, ...data } = v.planInput.parse(input);
  return phase3(actorId, managers, async (tx) => {
    const before = recordId
      ? await tx.maintenancePlan.findUnique({ where: { id: recordId } })
      : null;
    if (recordId) current(before, version);
    requireRule(
      data.nextDueDate >= businessDate(),
      "Start or resume plans on a current or future business date; past tickets remain unchanged.",
    );
    await validTarget(tx, data.bayId, data.equipmentId);
    await activeEmployee(tx, data.employeeId);
    const row = recordId
      ? await tx.maintenancePlan.update({
          where: { id: recordId },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.maintenancePlan.create({ data: { ...data, createdBy: actorId } });
    await audit(tx, actorId, "MAINTENANCE_PLAN_SAVED", row.id, { before, after: data, reason });
    return row;
  });
}
export async function maintenanceOverview(actorId: string) {
  return phase3(actorId, managers, async (tx) => {
    const tickets = await tx.maintenanceTicket.findMany({
      where: {},
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        targetDate: true,
        dueAt: true,
        createdAt: true,
        bay: { select: { identifier: true } },
        equipment: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return {
      manager: true,
      tickets,
      bays: await tx.carwashBay.findMany({
        select: { id: true, identifier: true },
        orderBy: { slot: "asc" },
      }),
      equipment: await tx.equipment.findMany({
        where: { active: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      }),
      employees: await tx.employee.findMany({
        where: { user: { active: true, role: { not: "BOOKKEEPER" } } },
        select: { id: true, user: { select: { name: true } } },
      }),
      vendors: await tx.vendor.findMany({
        where: { active: true, verifiedDate: { not: null } },
        select: { id: true, name: true },
      }),
      demo: (await tx.employee.count({ where: { demo: true } })) > 0,
    };
  });
}
export async function ticketDetail(actorId: string, ticketId: string) {
  return phase3(actorId, managers, async (tx) => {
    const access = { id: id.parse(ticketId) };
    return {
      management: true as const,
      ticket: await tx.maintenanceTicket.findFirst({
        where: access,
        include: {
          bay: true,
          equipment: true,
          vendor: true,
          assigned: { select: { user: { select: { name: true } } } },
          events: { orderBy: { createdAt: "asc" } },
        },
      }),
    };
  });
}
export async function registry(actorId: string) {
  return phase3(actorId, managers, async (tx) => ({
    bays: await tx.carwashBay.findMany({
      orderBy: { slot: "asc" },
      include: {
        responsible: { select: { user: { select: { name: true } } } },
        equipment: true,
        downtime: { orderBy: { startedAt: "desc" }, take: 20 },
        tickets: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, title: true, status: true, targetDate: true },
        },
        plans: {
          where: { active: true },
          select: { id: true, title: true, nextDueDate: true, intervalDays: true },
        },
        _count: { select: { tickets: true, plans: true } },
      },
    }),
    equipment: await tx.equipment.findMany({
      orderBy: { name: "asc" },
      include: { bay: true, vendor: true, downtime: { orderBy: { startedAt: "desc" }, take: 20 } },
    }),
    vendors: await tx.vendor.findMany({ orderBy: { name: "asc" } }),
    employees: await tx.employee.findMany({
      where: { user: { active: true, role: { not: "BOOKKEEPER" } } },
      select: { id: true, user: { select: { name: true } } },
    }),
    plans: await tx.maintenancePlan.findMany({
      include: {
        bay: true,
        equipment: true,
        employee: { select: { user: { select: { name: true } } } },
      },
      orderBy: { nextDueDate: "asc" },
    }),
    demo: (await tx.employee.count({ where: { demo: true } })) > 0,
  }));
}
export async function maintenanceSummary(actorId: string) {
  return phase3(actorId, managers, async (tx) => ({
    openTickets: await tx.maintenanceTicket.count({
      where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
    }),
    overdueTickets: await tx.maintenanceTicket.count({
      where: { status: { notIn: ["COMPLETED", "CANCELLED"] }, dueAt: { lt: new Date() } },
    }),
    offlineBays: await tx.carwashBay.count({
      where: { status: { in: ["OUT_OF_SERVICE", "UNDER_REPAIR"] } },
    }),
    unknownBays: await tx.carwashBay.count({ where: { status: "UNKNOWN" } }),
    configuredBays: await tx.carwashBay.count(),
    lowChemicals: await tx.chemicalItem
      .findMany({
        where: { active: true, balance: { not: null } },
        select: { id: true, name: true, balance: true, reorderPoint: true },
      })
      .then(
        (items) =>
          items.filter((i) => i.reorderPoint !== null && i.balance! <= i.reorderPoint).length,
      ),
  }));
}
