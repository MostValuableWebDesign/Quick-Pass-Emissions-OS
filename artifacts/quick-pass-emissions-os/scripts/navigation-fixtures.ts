import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";

// Called only after the owned disposable-database preflight in browser-regression.
// Credentials stay in process memory; only private cookie states are saved.
export async function navigationFixtures(
  db: PrismaClient,
  password: string,
  ownerId: string,
  progress: (stage: string) => void,
) {
  progress("private role credential hashing");
  const hash = await hashPassword(password);
  const users = [];
  for (const role of ["ADMIN", "BOOKKEEPER", "EMPLOYEE"] as const) {
    progress("private role fixture accounts");
    const email = `navigation-${role.toLowerCase()}-${randomUUID()}@example.test`;
    const user = await db.user.create({
      data: {
        email,
        name: `Navigation Fixture ${role}`,
        role,
        emailVerified: true,
        employee: { create: { demo: true } },
      },
      include: { employee: true },
    });
    await db.account.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: hash,
      },
    });
    users.push({ role, email, id: user.id, employeeId: user.employee!.id });
  }
  const employee = users.find((user) => user.role === "EMPLOYEE")!;
  progress("private task fixtures");
  const template = await db.taskTemplate.create({
    data: {
      title: "Navigation fixture assigned duty",
      frequency: "ONCE",
      startDate: "2026-01-01",
      dueTime: "09:00",
      employeeId: employee.employeeId,
    },
  });
  const task = await db.taskInstance.create({
    data: {
      templateId: template.id,
      occurrenceDate: "2026-01-01",
      title: template.title,
      description: "Disposable navigation fixture only",
      employeeId: employee.employeeId,
      dueAt: new Date("2026-01-01T14:00:00Z"),
      priority: "NORMAL",
      reviewRequired: true,
      escalationHours: 0,
    },
  });
  progress("private maintenance fixtures");
  const equipment = await db.equipment.create({
    data: { code: "NAVIGATION", name: "Navigation fixture equipment", category: "PUMP" },
  });
  const ticket = await db.maintenanceTicket.create({
    data: {
      equipmentId: equipment.id,
      title: "Navigation fixture maintenance",
      description: "Disposable navigation fixture only",
      priority: "NORMAL",
      assignedId: employee.employeeId,
      targetDate: "2026-01-01",
      dueAt: new Date("2026-01-01T22:00:00Z"),
      reportedBy: ownerId,
    },
  });
  progress("private billing fixtures");
  const dealer = await db.dealership.create({
    data: {
      code: "SENTINEL",
      name: "Navigation fixture dealership",
      billingAddress: "Fixture only",
    },
  });
  const invoice = await db.dealerInvoice.create({
    data: {
      number: "SENTINEL",
      dealershipId: dealer.id,
      issueDate: "2026-01-01",
      dueDate: "2026-01-31",
      state: "APPROVED",
      subtotalCents: 1000,
      taxBps: 0,
      taxCents: 0,
      totalCents: 1000,
      snapshot: {
        code: dealer.code,
        name: dealer.name,
        billingAddress: dealer.billingAddress,
        termsDays: 30,
        termsReference: "Disposable fixture only",
        contacts: [],
      },
      notes: "Disposable navigation fixture only",
      createdBy: ownerId,
      approvedBy: users.find((user) => user.role === "ADMIN")!.id,
      approvedAt: new Date("2026-01-02T12:00:00Z"),
    },
  });
  progress("private payroll fixture");
  const payroll = await db.payrollPeriod.create({
    data: {
      startDate: "2026-02-01",
      endDate: "2026-02-07",
      label: "Navigation fixture review",
      createdBy: ownerId,
    },
  });
  return {
    users,
    records: {
      task: task.id,
      maintenance: ticket.id,
      employee: employee.employeeId,
      invoice: invoice.id,
      dealership: invoice.dealershipId,
      payroll: payroll.id,
    },
  };
}
