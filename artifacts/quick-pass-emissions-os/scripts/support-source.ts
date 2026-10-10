// Operator-only source preparation. Private documents and manifests never become
// bundled application data. No business mutation is performed by this script.
import "dotenv/config";
import { readFile, mkdir, writeFile, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { db } from "../src/lib/db";
import { checkStorage } from "../src/lib/storage";
import { importInput, type ImportInput } from "../src/modules/business-import/rules";
import { previewImport, sealPreview } from "../src/modules/business-import/service";
import { CATEGORIES } from "../src/modules/support/rules";
async function main() {
  const [sourceFile, outputName, ...extra] = process.argv.slice(2);
  if (!sourceFile || !/^[a-z0-9-]+$/.test(outputName ?? "") || extra.length)
    throw Error("Use support-source <private-operations-guide> <new-output-name>.");
  const source = await readFile(sourceFile, "utf8");
  const sourceFingerprint = createHash("sha256").update(source).digest("hex");
  function supplied(pattern: RegExp) {
    const value = source.match(pattern)?.[1]?.trim();
    if (!value) throw Error("Required source section missing; do not guess.");
    return value;
  }
  const phone = {
    opus: supplied(/OPUS TECH[\s\S]*?Phone:\s*([\d-]+)/),
    pit: supplied(/Chris\s*—\s*Pit Pro\s*([\d-]+)/),
    advanced: supplied(/The Advanced Group[\s\S]*?operational issues:\s*([\d-]+)/),
    parts: supplied(/KleenRite[\s\S]*?Phone:\s*([\d-]+)/),
  };
  const identifiers = {
    opus: supplied(/Tech ID:\s*(\d+)/),
    parts: supplied(/Customer Number:\s*(\d+)/),
  };
  if (
    !source.includes("ONLY time we deal with KleenRite") ||
    !source.includes("Robert fixes the belts")
  )
    throw Error("Final source correction required.");
  const input: ImportInput = {
    sourceName: "Operations & Responsibilities Guide — support enrichment",
    sourceFingerprint,
    items: [
      {
        key: "opus-support",
        section: "Analyzer Service & Technical Support",
        entity: "VENDOR",
        values: {
          name: "OPUS TECH",
          contact: "",
          phone: phone.opus,
          email: "",
          services: "Analyzer service and technical support",
          reference: "",
          notes: "",
          directory: {
            categories: [CATEGORIES[0]],
            accountReference: identifiers.opus,
            sourceReference: "Operations guide — Analyzer Service & Technical Support",
            supportedServices: "Emissions analyzer service and technical support",
            operationalInstructions: "Call immediately if analyzer problems occur.",
          },
        },
      },
      {
        key: "pit-support",
        section: "Drain Pit Maintenance",
        entity: "VENDOR",
        values: {
          name: "Pit Pro",
          contact: "Chris",
          phone: phone.pit,
          email: "",
          services: "Drain pit cleaning and service",
          reference: "",
          notes: "",
          directory: {
            categories: [CATEGORIES[1]],
            sourceReference: "Operations guide — Drain Pit Maintenance",
            supportedServices: "Drain pit cleaning and service",
            operationalInstructions: "Schedule cleanings as needed.",
          },
        },
      },
      {
        key: "advanced-support",
        section: "Carwash Equipment Service and final correction",
        entity: "VENDOR",
        values: {
          name: "The Advanced Group",
          contact: "Adam or Lamar",
          phone: phone.advanced,
          email: "",
          services: "Carwash equipment service, chemicals, storage motors and pumps",
          reference: "",
          notes: "",
          directory: {
            categories: [CATEGORIES[2]],
            sourceReference: "Operations guide — Carwash Equipment Service; final correction",
            supportedServices:
              "Wash equipment, soap/wax and other wash chemicals; storage motors and pumps",
            operationalInstructions:
              "Call immediately for mechanical failures, wash equipment problems, pump issues or system malfunctions. Adam or Lamar; individual contact details are not supplied.",
          },
        },
      },
      {
        key: "parts-support",
        section: "Carwash Supplies and final correction",
        entity: "VENDOR",
        values: {
          name: "KleenRite",
          contact: "",
          phone: phone.parts,
          email: "",
          services: "Carwash parts only",
          reference: "",
          notes: "",
          directory: {
            categories: [CATEGORIES[4]],
            accountReference: identifiers.parts,
            sourceReference: "Operations guide — Carwash Supplies; final correction",
            supportedServices: "Carwash parts: hoses, nozzles, spray guns, swivels and brushes",
            operationalInstructions:
              "Parts only. Wash chemicals and storage motors/pumps are supported by The Advanced Group. Motor belts are the documented retail/Amazon exception.",
          },
        },
      },
      {
        key: "camera-review",
        section: "Security Cameras",
        entity: "REVIEW",
        values: {
          title: "Camera/security support — incomplete identity",
          details:
            "Termayne is named for camera/security concerns. No surname, business identity or contact method supplied. Do not let cameras remain down.",
          required:
            "Owner-confirmed provider identity, operational contact and independent verification",
        },
      },
      {
        key: "belt-review",
        section: "Final correction — motor belts",
        entity: "REVIEW",
        values: {
          title: "Belt repair — incomplete identity and retail exception",
          details:
            "Robert fixes storage motor belts unless staff can do it. Auto Zone, Pep Boys and Amazon are belt purchase exceptions, not confirmed repair providers.",
          required: "Owner-confirmed identity/contact for Robert; no equipment assignment inferred",
        },
      },
    ],
  };
  // Reuse source-backed legacy fields exactly when this same document's prior
  // retained provenance identified the record. Still compare current records
  // in preview; later staff edits are never hidden by copying current values.
  const prior = await db.businessImport.findMany({ where: { sourceFingerprint } });
  for (const item of input.items) {
    if (item.entity !== "VENDOR") continue;
    const candidates = prior
      .flatMap((run) => (Array.isArray(run.items) ? run.items : []))
      .filter(
        (row) =>
          row &&
          typeof row === "object" &&
          !Array.isArray(row) &&
          row.entity === "VENDOR" &&
          row.match &&
          ["CREATED", "UPDATED", "UNCHANGED"].includes(String(row.outcome)) &&
          row.proposed &&
          typeof row.proposed === "object" &&
          !Array.isArray(row.proposed) &&
          row.proposed.name === item.values.name,
      );
    const ids = new Set(candidates.map((row) => (row as { match: string }).match));
    if (ids.size === 1) {
      const retained = candidates[0] as unknown as {
        match: string;
        proposed: Record<string, string>;
      };
      item.recordId = retained.match;
      for (const key of ["contact", "phone", "email", "services", "reference", "notes"] as const)
        if (typeof retained.proposed[key] === "string") item.values[key] = retained.proposed[key];
    }
  }
  importInput.parse(input);
  const root = path.resolve("../../work/business-import");
  await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);
  const save = (suffix: string, value: unknown) =>
    writeFile(path.join(root, `${outputName}-${suffix}.json`), JSON.stringify(value, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
  await save("input", input);
  const pinned = !!process.env.EXPECTED_DATABASE_ID;
  const store = await checkStorage(db, process.env.EXPECTED_DATABASE_ID);
  const owners = await db.user.findMany({
    where: { role: "OWNER", active: true },
    select: { id: true },
  });
  if (!pinned || owners.length !== 1 || process.env.NODE_ENV === "production") {
    console.log(
      JSON.stringify({
        stagedProviders: 4,
        stagedReviewItems: 2,
        businessWrites: 0,
        previewBlocked: !pinned
          ? "Database identity pin missing"
          : "Unique active owner/development target required",
      }),
    );
    return;
  }
  const target = {
    actorId: owners[0].id,
    instanceId: store!.instanceId,
    environment: "development-preview",
  };
  await save("target", target);
  const preview = await previewImport(target.actorId, input);
  await save("preview", { preview, token: sealPreview(preview) });
  console.log(
    JSON.stringify({
      businessWrites: 0,
      mode: "protected-preview",
      counts: preview.counts,
      conflicts: preview.items
        .filter((i) => i.outcome === "CONFLICTED")
        .map((i) => ({ key: i.key, message: i.message })),
      backupConfigured: !!process.env.DATA_BACKUP_DIR,
      targetVerified: true,
    }),
  );
}
main()
  .catch(() => {
    console.error(
      "Private source preparation blocked. Check source, target identity, migrations and private output permissions; no private diagnostics printed.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
