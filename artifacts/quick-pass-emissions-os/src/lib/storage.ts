import type { PrismaClient } from "@prisma/client";

export class StorageError extends Error {}

export async function checkStorage(
  client: PrismaClient,
  expectedId: string | undefined,
  allowUninitialized = false,
) {
  if (
    expectedId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(expectedId)
  )
    throw new StorageError("EXPECTED_DATABASE_ID must be the storage ID shown in Settings.");
  const [table] = await client.$queryRaw<{ present: boolean }[]>`
    SELECT to_regclass('"DataStore"') IS NOT NULL AS present
  `;
  if (!table?.present) {
    if (allowUninitialized && !expectedId) return null;
    throw new StorageError(
      "Storage identity is missing. Check DATABASE_URL and apply migrations before starting.",
    );
  }
  const store = await client.dataStore.findUnique({ where: { id: "business" } });
  if (!store || (expectedId && store.instanceId.toLowerCase() !== expectedId.toLowerCase()))
    throw new StorageError(
      "Storage identity does not match. Check DATABASE_URL; existing records may be in a different database. No data was reset.",
    );
  return store;
}
