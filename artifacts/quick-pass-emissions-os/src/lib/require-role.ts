import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { currentUser } from "./access";
export async function requireRole(roles: Role[]) {
  const user = await currentUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}
