import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  backupDatabase,
  databaseUrl,
  migrateDatabase,
  restoreDatabase,
} from "../src/lib/database-maintenance";
import { checkStorage, StorageError } from "../src/lib/storage";

async function main() {
  const [command, ...input] = process.argv.slice(2);
  const [file, ...extra] = input[0] === "--" ? input.slice(1) : input;
  if (
    extra.length ||
    !["check", "migrate", "backup", "restore"].includes(command) ||
    (command === "restore" ? !file : !!file)
  )
    throw new StorageError("Use db:check, db:migrate, db:backup, or db:restore -- <backup.dump>.");
  databaseUrl(process.env.DATABASE_URL);
  if (command === "restore") {
    await restoreDatabase(file!, process.env);
    console.log(
      "Backup restored into the separate database. Verify it before switching DATABASE_URL.",
    );
    return;
  }
  const client = new PrismaClient();
  try {
    if (command === "migrate") await migrateDatabase(client, process.env);
    else {
      const store = await checkStorage(client, process.env.EXPECTED_DATABASE_ID);
      if (command === "backup") {
        const destination = await backupDatabase(process.env.DATABASE_URL!, process.env);
        console.log(`Private backup completed: ${destination}`);
      } else console.log(`Persistent storage verified: ${store!.instanceId}.`);
    }
  } finally {
    await client.$disconnect();
  }
}
main().catch((error: unknown) => {
  // Prisma/tool errors can contain connection credentials. Only our fixed diagnostics escape.
  console.error(
    error instanceof StorageError
      ? error.message
      : "Database operation failed. Check private server configuration; no reset was requested.",
  );
  process.exitCode = 1;
});
