import type { Role, TaskStatus } from "@prisma/client";
export function isManager(role: Role) {
  return role === "OWNER" || role === "ADMIN";
}
export function canManageRole(actor: Role, target: Role) {
  return actor === "OWNER" || (actor === "ADMIN" && target === "EMPLOYEE");
}
export function canAccessTask(role: Role) {
  return isManager(role);
}
export function overdue(status: TaskStatus, due: Date, now = new Date()) {
  return !["COMPLETED", "CANCELLED"].includes(status) && due < now;
}
export function canTransition(from: TaskStatus, to: TaskStatus, manager: boolean) {
  return manager && from !== to;
}
