import "dotenv/config";
import { readFile, writeFile, mkdir, chmod, stat } from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";
import { checkStorage } from "../src/lib/storage";
import {
  previewImport,
  applyImport,
  sealPreview,
  openPreview,
} from "../src/modules/business-import/service";
import { importBackup } from "../src/modules/business-import/backup";
async function privateWrite(filename: string, value: unknown) {
  const full = path.resolve(filename);
  const privateRoot = path.resolve("../../work/business-import");
  if (!full.startsWith(privateRoot + path.sep))
    throw Error("Private output must be inside workspace work/business-import.");
  await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
  await chmod(path.dirname(full), 0o700);
  await writeFile(full, JSON.stringify(value, null, 2), { mode: 0o600, flag: "wx" });
}
async function main() {
  const [command, source, targetFile, output, ...extra] = process.argv.slice(2);
  if (!["preview", "apply"].includes(command) || !source || !targetFile || !output || extra.length)
    throw Error(
      "Use business-import preview|apply <input-or-sealed-preview> <private-target.json> <new-private-output.json>.",
    );
  if ((await stat(targetFile)).mode & 0o077)
    throw Error("Target metadata must be private mode 0600.");
  const target = JSON.parse(await readFile(targetFile, "utf8")) as {
    instanceId: string;
    actorId: string;
    environment: string;
  };
  if (target.environment !== "development-preview" || process.env.NODE_ENV === "production")
    throw Error(
      "This operator import command is limited to development preview. Production requires separate authorization.",
    );
  const store = await checkStorage(db, target.instanceId);
  const sourceData = JSON.parse(await readFile(source, "utf8"));
  if (command === "preview") {
    const preview = await previewImport(target.actorId, sourceData);
    if (preview.storeId !== store!.instanceId) throw Error("Database identity changed.");
    await privateWrite(output, { preview, token: sealPreview(preview) });
    console.log(
      JSON.stringify({
        mode: "dry-run",
        businessWrites: 0,
        counts: preview.counts,
        environment: target.environment,
      }),
    );
  } else {
    if ((await stat(source)).mode & 0o077) throw Error("Sealed preview must be private mode 0600.");
    const preview = openPreview(sourceData.token);
    if (preview.storeId !== target.instanceId) throw Error("Reviewed target differs.");
    const result = await applyImport(target.actorId, preview, () => importBackup());
    await privateWrite(output, {
      ...result,
      environment: target.environment,
      backupVerified: true,
    });
    console.log(
      JSON.stringify({
        mode: "applied",
        counts: result.counts,
        repeated: result.repeated,
        environment: target.environment,
        backupVerified: true,
      }),
    );
  }
}
main()
  .catch(() => {
    console.error(
      "Import did not complete. No private error content was logged. Inspect target/manifest permissions, owner access, backup configuration and migrations; then run a new preview. A committed run is safely repeatable if only receipt writing failed.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
