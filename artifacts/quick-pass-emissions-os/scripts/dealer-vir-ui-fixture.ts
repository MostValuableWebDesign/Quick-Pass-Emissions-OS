/**
 * Owns only synthetic verification records. Never switches Preview's database
 * or changes existing credentials, dealership accounts, invoices or payments.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { hashPassword } from "better-auth/crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { db } from "../src/lib/db";
import { addDays, businessDate } from "../src/lib/time";

const folder = resolve("../../work/dealer-vir-verification");
const registryPath = resolve(folder, "owned.json");
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;

async function main() {
  if (process.env.NODE_ENV === "production" || !process.env.REPLIT_DEV_DOMAIN)
    throw Error("Development verification only.");
  if (process.argv[2] === "cleanup") {
    const registry = JSON.parse(await readFile(registryPath, "utf8")) as {
      ownerId: string;
      dealerId: string;
      marker: string;
    };
    await db.$transaction(async (tx) => {
      const owner = await tx.user.findUnique({ where: { id: registry.ownerId } });
      const dealer = await tx.dealership.findUnique({ where: { id: registry.dealerId } });
      if (owner?.name !== registry.marker || (dealer && dealer.code !== registry.marker))
        throw Error("Fixture ownership mismatch.");
      const invoices = await tx.dealerInvoice.findMany({
        where: { dealershipId: registry.dealerId },
        select: { id: true },
      });
      const ids = invoices.map((i) => i.id);
      if (await tx.dealerPayment.count({ where: { invoiceId: { in: ids } } }))
        throw Error("Fixture has unexpected payments; refusing cleanup.");
      await tx.dealerVirRecord.deleteMany({
        where: { dealershipId: registry.dealerId, createdBy: registry.ownerId },
      });
      await tx.dealerVirUpload.deleteMany({
        where: { dealershipId: registry.dealerId, createdBy: registry.ownerId },
      });
      await tx.dealerService.updateMany({
        where: { dealershipId: registry.dealerId },
        data: { invoiceId: null },
      });
      await tx.dealerInvoiceLine.deleteMany({ where: { invoiceId: { in: ids } } });
      await tx.dealerInvoice.deleteMany({
        where: { dealershipId: registry.dealerId, createdBy: registry.ownerId },
      });
      await tx.dealerService.deleteMany({
        where: { dealershipId: registry.dealerId, createdBy: registry.ownerId },
      });
      await tx.dealership.delete({ where: { id: registry.dealerId } });
      await tx.auditLog.deleteMany({ where: { actorId: registry.ownerId } });
      await tx.notification.deleteMany({ where: { userId: registry.ownerId } });
      await tx.user.delete({ where: { id: registry.ownerId } });
    });
    await rm(folder, { recursive: true, force: true });
    console.log("Removed only the owned synthetic VIR browser fixtures and private session files.");
    return;
  }
  try {
    await readFile(registryPath);
    throw Error("A fixture already exists; clean it up before preparing another.");
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
      throw error;
  }
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const marker = `VIR verification ${randomUUID()}`;
  const password = randomBytes(30).toString("base64url");
  const email = `${randomUUID()}@vir-verification.example.test`;
  const owner = await db.user.create({
    data: { name: marker, email, emailVerified: true, role: "OWNER", active: true },
  });
  const dealer = await db.dealership.create({
    data: {
      code: marker,
      name: marker,
      billingAddress: "Synthetic verification only",
      defaultRateCents: 2000,
      termsDays: 30,
      taxBps: 0,
      termsAuthorizedBy: owner.id,
      termsAuthorizedAt: new Date(),
      termsReference: "Synthetic verification, not a real account",
    },
  });
  await writeFile(
    registryPath,
    JSON.stringify({ ownerId: owner.id, dealerId: dealer.id, marker }),
    { mode: 0o600 },
  );
  await db.account.create({
    data: {
      id: randomUUID(),
      userId: owner.id,
      accountId: owner.id,
      providerId: "credential",
      password: await hashPassword(password),
    },
  });
  const response = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw Error("Native fixture sign-in failed.");
  const cookies = response.headers.getSetCookie().map((line) => {
    const [pair] = line.split(";");
    const split = pair.indexOf("=");
    return {
      name: pair.slice(0, split),
      value: pair.slice(split + 1),
      domain: new URL(origin).hostname,
      path: "/",
      httpOnly: /httponly/i.test(line),
      secure: /;\s*secure/i.test(line),
      sameSite: "Lax",
    };
  });
  if (!cookies.some((cookie) => cookie.name.includes("session_token")))
    throw Error("No native fixture session returned.");
  await writeFile(resolve(folder, "browser-state.json"), JSON.stringify({ cookies, origins: [] }), {
    mode: 0o600,
  });
  const date = addDays(businessDate(), -2);
  const [year, month, day] = date.split("-");
  const cert = `ZX${String(Math.floor(Math.random() * 900000) + 100000)}`;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const [index, values] of [
    [0, { cert, type: "Initial", fee: "$20.00", test: "91106999991" }],
    [1, { cert: "RETEST", type: "Retest", fee: "$0.00", test: "91106999992" }],
  ] as const) {
    const page = pdf.addPage([612, 792]);
    const lines = [
      "GEORGIA VEHICLE EMISSIONS INSPECTION REPORT",
      "SYNTHETIC VERIFICATION ONLY",
      "OVERALL TEST RESULT: PASS",
      `CERTIFICATE NUMBER: ${values.cert}`,
      `Test Date/Time: ${month}/${day}/${year} @ ${index + 10}:00`,
      `Test Type: ${values.type}`,
      `Test Fee: ${values.fee}`,
      `Test ID: ${values.test}`,
    ];
    lines.forEach((line, i) => page.drawText(line, { x: 40, y: 720 - i * 45, size: 14, font }));
  }
  // Rasterize the second page so the real browser flow exercises local OCR.
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: await pdf.save(), verbosity: 0 });
  const doc = await task.promise;
  const page = await doc.getPage(2);
  const viewport = page.getViewport({ scale: 1.5 });
  const factory = doc.canvasFactory as {
    create(
      w: number,
      h: number,
    ): {
      canvas: HTMLCanvasElement & { toBuffer(format: string): Buffer };
      context: CanvasRenderingContext2D;
    };
    destroy(surface: object): void;
  };
  const canvas = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ viewport, canvas: canvas.canvas, canvasContext: canvas.context }).promise;
  const image = await pdf.embedPng(canvas.canvas.toBuffer("image/png"));
  pdf.removePage(1);
  pdf.addPage([612, 792]).drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
  factory.destroy(canvas);
  await task.destroy();
  await writeFile(resolve(folder, "fixture-virs.pdf"), await pdf.save(), { mode: 0o600 });
  await writeFile(
    resolve(folder, "public.json"),
    JSON.stringify({
      dealershipName: marker,
      dealershipPath: `/dealerships/${dealer.id}`,
      certificate: cert,
      pdfPath: resolve(folder, "fixture-virs.pdf"),
      statePath: resolve(folder, "browser-state.json"),
      expected: { reports: 2, billable: 1, free: 1, totalCents: 2000 },
    }),
    { mode: 0o600 },
  );
  console.log(
    "Prepared two synthetic VIR pages and a private native-authenticated browser session. No existing records were changed.",
  );
}

main()
  .catch(() => {
    console.error("VIR browser fixture setup/cleanup failed; sensitive error details suppressed.");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
