import type { Role, TaskStatus } from "@prisma/client";
export function isManager(role: Role) {
  return role === "OWNER" || role === "ADMIN";
}
export function canManageRole(actor: Role, target: Role) {
  return actor === "OWNER" || (actor === "ADMIN" && target === "EMPLOYEE");
}
export function canAccessTask(role: Role, ownEmployeeId: string | undefined, assignedId: string) {
  return isManager(role) || (role === "EMPLOYEE" && ownEmployeeId === assignedId);
}
export function overdue(status: TaskStatus, due: Date, now = new Date()) {
  return !["COMPLETED", "CANCELLED"].includes(status) && due < now;
}
export function canTransition(from: TaskStatus, to: TaskStatus, manager: boolean) {
  if (from === to) return false;
  if (manager) return true;
  if (from === "COMPLETED" || from === "CANCELLED") return false;
  return ["IN_PROGRESS", "BLOCKED", "COMPLETED"].includes(to);
}
