import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { backupDatabase } from "@/lib/database-maintenance";
import { StorageError } from "@/lib/storage";
// Never accept a checkbox, client-provided archive path or forged receipt as backup evidence.
export async function importBackup(env: NodeJS.ProcessEnv = process.env) {
  const destination = await backupDatabase(env.DATABASE_URL!, env);
  const info = await stat(destination);
  if ((info.mode & 0o777) !== 0o600) throw new StorageError("Backup is not access-controlled.");
  const tool = env.PG_TOOLS_BIN ? path.join(env.PG_TOOLS_BIN, "pg_restore") : "pg_restore";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(tool, ["--list", destination], { stdio: "ignore" });
    child.once("error", () => reject(new StorageError("Backup archive verification failed.")));
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(new StorageError("Backup archive verification failed.")),
    );
  });
}
