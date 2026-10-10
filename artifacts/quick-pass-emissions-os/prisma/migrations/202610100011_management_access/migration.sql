-- Staff identities remain linked to payroll, schedules and operational history.
-- Retire only authentication and personal delivery state for non-management roles.
DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE role NOT IN ('OWNER', 'ADMIN'));
DELETE FROM "Account" WHERE "userId" IN (SELECT id FROM "User" WHERE role NOT IN ('OWNER', 'ADMIN'));
UPDATE "Invite" SET "usedAt" = CURRENT_TIMESTAMP WHERE "usedAt" IS NULL AND "employeeId" IN (SELECT e.id FROM "Employee" e JOIN "User" u ON u.id = e."userId" WHERE u.role NOT IN ('OWNER', 'ADMIN'));
UPDATE "Notification" SET "resolvedAt" = CURRENT_TIMESTAMP WHERE "resolvedAt" IS NULL AND "userId" IN (SELECT id FROM "User" WHERE role NOT IN ('OWNER', 'ADMIN'));
UPDATE "ActionReminder" SET "resolvedAt" = CURRENT_TIMESTAMP, resolution = 'MANAGEMENT_ONLY_ACCESS' WHERE "resolvedAt" IS NULL AND "userId" IN (SELECT id FROM "User" WHERE role NOT IN ('OWNER', 'ADMIN'));
