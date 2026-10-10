import { randomUUID } from "node:crypto";
import { assertOwnedDatabase } from "./e2e-safety.mjs";
import { previewImport, applyImport } from "../src/modules/business-import/service";
import { importBackup } from "../src/modules/business-import/backup";
import type { ImportInput } from "../src/modules/business-import/rules";

// Setup runs under tsx, not Playwright's module transformer. Never allow a
// continuation fixture (including its backup) to use the business datasource.
export async function businessImportBrowserFixture(ownerId: string, env: NodeJS.ProcessEnv) {
  assertOwnedDatabase(process.env);
  assertOwnedDatabase(env);
  if (env.DATABASE_URL !== process.env.DATABASE_URL)
    throw Error("Fixture datasource override differs.");
  const id = randomUUID();
  const name = `Import fixture supplier ${id}`;
  const chemical = `Import fixture chemical ${id}`;
  const source: ImportInput = {
    sourceName: "Synthetic browser operations",
    sourceFingerprint: "c".repeat(64),
    items: [
      {
        entity: "VENDOR",
        key: "vendor",
        section: "Synthetic supplier section",
        values: {
          name,
          contact: "",
          phone: "555-fixture",
          email: "",
          services: "Fixture parts",
          reference: `fixture-${id}`,
          notes: "",
        },
      },
      {
        entity: "CHEMICAL",
        key: "chemical",
        section: "Synthetic catalog section",
        values: { name: chemical, notes: "Synthetic, no unit or stock inferred." },
      },
      {
        entity: "CERTIFICATES",
        key: "certificates",
        section: "Synthetic order minimum",
        values: { minimumOrder: 300 },
      },
      {
        entity: "REVIEW",
        key: "review",
        section: "Synthetic compensation section",
        values: {
          title: "Identity/effective date missing",
          details: "No pay or shifts authorized.",
          required: "Owner identity mapping and effective date",
        },
      },
    ],
  };
  const preview = await previewImport(ownerId, source);
  const result = await applyImport(ownerId, preview, () => importBackup(env));
  if (result.counts.created !== 3 || result.counts.skipped !== 1 || result.counts.conflicted)
    throw Error("Owned import continuation fixture was not fully prepared.");
  return { name, chemical, manifest: JSON.stringify(source) };
}
