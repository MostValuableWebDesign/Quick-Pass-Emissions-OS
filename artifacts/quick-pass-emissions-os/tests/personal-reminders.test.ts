import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  automation: vi.fn(),
  audit: vi.fn(),
  reminderEvent: {
    create: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  notification: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  db: {
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/modules/automation/transaction", () => ({ automation: mocks.automation }));
vi.mock("@/modules/phase2", () => ({
  audit: mocks.audit,
  requireRule: (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    user: mocks.db.user,
    reminderEvent: mocks.reminderEvent,
    notification: mocks.notification,
  },
}));

import {
  acknowledgePersonalReminder,
  changePersonalReminderState,
  createPersonalReminder,
  personalNotificationInbox,
  updatePersonalReminder,
} from "@/modules/automation/personal-reminders";

const actor = "manager-user";
const eventId = "c1234567890123456789012345";
const startInput = {
  title: "Georgia dashboard appointment",
  description: "Review the inspection equipment.",
  location: "Quick Pass",
  startsAt: "2026-10-12T09:00",
  alertMinutes: 15,
};

describe("personal in-app reminders", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T15:00:00.000Z"));
    vi.clearAllMocks();
    mocks.automation.mockImplementation(
      (_actorId: string, _roles: string[], work: (tx: unknown) => Promise<unknown>) =>
        work({
          reminderEvent: mocks.reminderEvent,
          notification: mocks.notification,
        }),
    );
    mocks.db.user.findUnique.mockResolvedValue({ active: true, role: "OWNER" });
    mocks.reminderEvent.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: eventId, ...data, readAt: null, completedAt: null, cancelledAt: null,
    }));
    mocks.reminderEvent.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: eventId, ...data,
    }));
    mocks.reminderEvent.findFirst.mockResolvedValue({
      id: eventId, startsAt: new Date("2026-10-12T13:00:00.000Z"),
      alertAt: new Date("2026-10-12T12:45:00.000Z"),
    });
  });

  afterEach(() => vi.useRealTimers());

  it("saves Eastern event and alert instants and scopes creation to the signed-in manager", async () => {
    await createPersonalReminder(actor, startInput);
    expect(mocks.automation).toHaveBeenCalledWith(
      actor,
      ["OWNER", "ADMIN"],
      expect.any(Function),
    );
    expect(mocks.reminderEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ...startInput,
        userId: actor,
        startsAt: new Date("2026-10-12T13:00:00.000Z"),
        alertAt: new Date("2026-10-12T12:45:00.000Z"),
      }),
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(), actor, "PERSONAL_REMINDER_CREATED", eventId,
      expect.objectContaining({ alertMinutes: 15 }),
    );
  });

  it("rejects invalid or past dates and unapproved alert choices before saving", async () => {
    await expect(createPersonalReminder(actor, { ...startInput, startsAt: "2026-02-30T25:00" }))
      .rejects.toThrow("Enter a valid date and time");
    await expect(createPersonalReminder(actor, { ...startInput, startsAt: "2026-10-11T10:00" }))
      .rejects.toThrow("Choose a date and time in the future");
    await expect(createPersonalReminder(actor, { ...startInput, alertMinutes: 30 }))
      .rejects.toThrow("Choose a valid alert time");
    expect(mocks.reminderEvent.create).not.toHaveBeenCalled();
  });

  it("updates only the manager's open reminder and clears its previous read state", async () => {
    await updatePersonalReminder(actor, { ...startInput, id: eventId, title: "Updated appointment" });
    expect(mocks.reminderEvent.findFirst).toHaveBeenCalledWith({
      where: { id: eventId, userId: actor, completedAt: null, cancelledAt: null },
    });
    expect(mocks.reminderEvent.update).toHaveBeenCalledWith({
      where: { id: eventId },
      data: expect.objectContaining({ title: "Updated appointment", readAt: null }),
    });
  });

  it("does not disclose or update reminders that belong to another manager", async () => {
    mocks.reminderEvent.findFirst.mockResolvedValue(null);
    await expect(updatePersonalReminder(actor, { ...startInput, id: eventId }))
      .rejects.toThrow("This reminder is no longer available to update");
    expect(mocks.reminderEvent.update).not.toHaveBeenCalled();
  });

  it.each([
    ["complete", "PERSONAL_REMINDER_COMPLETED", { completedAt: expect.any(Date) }],
    ["cancel", "PERSONAL_REMINDER_CANCELLED", { cancelledAt: expect.any(Date) }],
  ] as const)("soft-%ss events instead of deleting their records", async (state, auditName, change) => {
    await changePersonalReminderState(actor, { id: eventId }, state);
    expect(mocks.reminderEvent.findFirst).toHaveBeenCalledWith({
      where: { id: eventId, userId: actor, completedAt: null, cancelledAt: null },
      select: { id: true, alertAt: true, startsAt: true },
    });
    expect(mocks.reminderEvent.update).toHaveBeenCalledWith({
      where: { id: eventId }, data: change,
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(), actor, auditName, eventId, expect.any(Object),
    );
  });

  it("marks only due reminders read, leaving the event scheduled until completed", async () => {
    await acknowledgePersonalReminder(actor, { id: eventId });
    expect(mocks.reminderEvent.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: eventId, userId: actor, readAt: null, completedAt: null, cancelledAt: null,
        alertAt: { lte: new Date("2026-10-11T15:00:00.000Z") },
      }),
      select: { id: true, startsAt: true },
    });
    expect(mocks.reminderEvent.update).toHaveBeenCalledWith({
      where: { id: eventId }, data: { readAt: new Date("2026-10-11T15:00:00.000Z") },
    });
  });

  it("combines due event alerts and existing operations notifications for the bell count", async () => {
    mocks.reminderEvent.findMany.mockResolvedValue([
      { id: eventId, title: "Upcoming appointment", description: "Review equipment.", startsAt: new Date("2026-10-12T13:00:00Z") },
    ]);
    mocks.notification.findMany.mockResolvedValue([
      { id: "notice-1", title: "Operations alert", createdAt: new Date("2026-10-11T14:30:00Z"), taskId: "task-1", maintenanceId: null },
    ]);
    mocks.reminderEvent.count.mockResolvedValue(1);
    mocks.notification.count.mockResolvedValue(2);
    const inbox = await personalNotificationInbox(actor);
    expect(inbox.count).toBe(3);
    expect(inbox.items.map((item) => item.href)).toEqual([
      "/tasks/task-1", `/reminders#${eventId}`,
    ]);
    expect(inbox.timeZone).toBe("America/New_York");
    expect(mocks.reminderEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: actor, alertAt: { lte: new Date("2026-10-11T15:00:00.000Z") }, readAt: null, completedAt: null, cancelledAt: null },
      take: 5,
    }));
  });

  it("does not return reminder counts to a non-management account", async () => {
    mocks.db.user.findUnique.mockResolvedValue({ active: true, role: "EMPLOYEE" });
    await expect(personalNotificationInbox(actor))
      .rejects.toThrow("You do not have permission to view reminders");
    expect(mocks.reminderEvent.findMany).not.toHaveBeenCalled();
  });
});
