import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";
import { isManager } from "./policy";
export async function currentUser() {
  let session;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch (error) {
    if (
      error instanceof APIError &&
      ["UNAUTHORIZED", "FORBIDDEN", "401", "403"].includes(String(error.status))
    )
      redirect("/login");
    throw error;
  }
  if (!session) redirect("/login");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { employee: { select: { id: true } } },
  });
  if (!user?.active || !isManager(user.role)) redirect("/login");
  return user;
}
export async function manager() {
  const user = await currentUser();
  if (!isManager(user.role)) throw new Error("You do not have permission for this action.");
  return user;
}
export type Actor = Awaited<ReturnType<typeof currentUser>>;
