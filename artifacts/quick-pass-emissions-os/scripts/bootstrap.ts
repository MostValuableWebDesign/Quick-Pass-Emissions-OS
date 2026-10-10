import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { db } from "../src/lib/db";
async function main() {
  const data = z
    .object({
      email: z.email().transform((v) => v.toLowerCase()),
      name: z.string().min(1),
      password: z.string().min(12).max(128),
    })
    .parse({
      email: process.env.BOOTSTRAP_EMAIL,
      name: process.env.BOOTSTRAP_NAME,
      password: process.env.BOOTSTRAP_PASSWORD,
    });
  const password = await hashPassword(data.password);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183502)`;
    if (await tx.user.count())
      throw new Error("Bootstrap is only allowed on an empty user database.");
    const user = await tx.user.create({
      data: { name: data.name, email: data.email, role: "OWNER", employee: { create: {} } },
    });
    await tx.account.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password,
      },
    });
    await tx.auditLog.create({
      data: { actorId: user.id, action: "OWNER_BOOTSTRAPPED", entityId: user.id, details: {} },
    });
  });
  console.log("Owner created. Remove BOOTSTRAP_PASSWORD from your environment.");
}
main()
  .catch(() => {
    console.error("Bootstrap failed. Verify inputs and that the user database is empty.");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
