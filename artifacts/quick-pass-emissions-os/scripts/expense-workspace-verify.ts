/** Uses only accounts created by personal-workspace-verify.ts. Never edits existing business data. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { businessDate } from "../src/lib/time";
import {
  expenseWorkspace,
  mutateExpenseWorkspace as mutate,
} from "../src/modules/personal/expense-service";
import {
  prepareReceipt,
  completeReceipt,
  downloadReceipt,
  removePrivateReceiptObject,
} from "../src/modules/personal/expense-storage";
import { buildSpendingReport } from "../src/modules/personal/expense-rules";
import { mutatePersonalWorkspace } from "../src/modules/personal/service";
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Development verification only.");
  const { ids, marker } = JSON.parse(
    await readFile(resolve("work/personal-verification/owned.json"), "utf8"),
  ) as { ids: string[]; marker: string };
  assert.ok(marker.startsWith("Personal workspace verification "));
  for (const id of ids) assert.equal((await db.user.findUnique({ where: { id } }))?.name, marker);
  if (process.argv[2] === "cleanup") {
    const attachments = await db.personalExpenseAttachment.findMany({
      where: { expense: { userId: { in: ids } } },
    });
    for (const a of attachments) {
      await removePrivateReceiptObject(a.objectPath);
      const pending = a.objectPath.split("-saved-")[0];
      if (pending !== a.objectPath) await removePrivateReceiptObject(pending);
    }
    console.log("Removed receipt objects owned by the synthetic expense verification accounts.");
    return;
  }
  const [owner, other] = ids,
    today = businessDate(),
    expenseId = randomUUID();
  const source = await db.personalNote.findFirstOrThrow({
    where: { userId: owner, deletedAt: null },
  });
  const task = await db.personalTask.findFirstOrThrow({ where: { userId: owner } });
  const create = {
    op: "expense.create",
    id: expenseId,
    title: `Verification parts ${randomUUID()}`,
    amountCents: 10000,
    vendor: "Expense verification supplier",
    date: today,
    category: "Supplies",
    purpose: "Repair wash bay",
    paymentMethod: "Card",
    planned: false,
    noteId: source.id,
  };
  let r = await mutate(owner, create);
  const current = () => r.data.expenses.find((e) => e.id === expenseId)!;
  assert.equal(current().totals.status, "UNPAID");
  const retry = await mutate(owner, { ...create, id: randomUUID() });
  assert.equal(retry.duplicateOf, expenseId);
  assert.equal((await expenseWorkspace(other)).expenses.length, 0);
  await assert.rejects(
    mutate(other, {
      op: "expense.archive",
      id: expenseId,
      version: current().version,
      archived: true,
    }),
  );
  r = await mutate(owner, {
    op: "expense.link",
    id: expenseId,
    version: current().version,
    taskId: task.id,
  });
  r = await mutate(owner, {
    op: "expense.link",
    id: expenseId,
    version: current().version,
    taskId: task.id,
  });
  assert.equal(current().links.length, 2);
  await assert.rejects(
    mutate(owner, { op: "expense.archive", id: expenseId, version: 1, archived: true }),
  );
  const payId = randomUUID(),
    payment = {
      op: "entry.add",
      expenseId,
      version: current().version,
      id: payId,
      kind: "PAYMENT",
      amountCents: 4000,
      date: today,
      fundingSource: "BUSINESS",
      paymentMethod: "Card",
      note: "First part",
    };
  r = await mutate(owner, payment);
  r = await mutate(owner, payment);
  assert.equal(current().entries.filter((e) => e.id === payId).length, 1);
  assert.equal(current().totals.balanceCents, 6000);
  const add = async (kind: string, n: number, fundingSource = "BUSINESS") => {
    r = await mutate(owner, {
      op: "entry.add",
      expenseId,
      version: current().version,
      id: randomUUID(),
      kind,
      amountCents: n,
      date: today,
      fundingSource,
    });
  };
  await add("REFUND", 1000);
  const refund = current().entries.find((e) => e.kind === "REFUND")!;
  await add("PAYMENT", 6000, "PERSONAL");
  await add("REIMBURSEMENT", 6000, "PERSONAL");
  assert.equal(current().totals.spentCents, 9000);
  await add("REFUND", 2000, "PERSONAL");
  assert.equal(current().totals.reimbursementReturnDueCents, 2000);
  await add("REIMBURSEMENT_RETURN", 2000, "PERSONAL");
  assert.equal(current().totals.reimbursementReturnDueCents, 0);
  assert.equal(current().totals.status, "PAID");
  await assert.rejects(
    mutate(owner, {
      op: "entry.correct",
      expenseId,
      version: current().version,
      id: randomUUID(),
      entryId: payId,
      kind: "PAYMENT",
      amountCents: 5000,
      date: today,
      fundingSource: "BUSINESS",
      reason: "Would overpay",
    }),
  );
  assert.equal(
    (await expenseWorkspace(owner)).expenses
      .find((e) => e.id === expenseId)
      ?.entries.find((e) => e.id === payId)?.voidedAt,
    null,
  );
  r = await mutate(owner, {
    op: "entry.correct",
    expenseId,
    version: current().version,
    id: randomUUID(),
    entryId: payId,
    kind: "PAYMENT",
    amountCents: 3000,
    date: today,
    fundingSource: "BUSINESS",
    reason: "Corrected receipt total",
  });
  assert.ok(current().entries.find((e) => e.id === payId)?.voidedAt);
  assert.equal(current().totals.balanceCents, 1000);
  r = await mutate(owner, {
    op: "entry.void",
    expenseId,
    version: current().version,
    entryId: refund.id,
    reason: "Not actually refunded",
  });
  assert.ok(current().entries.find((e) => e.id === refund.id)?.voidedAt);
  assert.equal(current().totals.spentCents, 7000);
  const plan = await mutate(owner, {
    op: "expense.create",
    id: randomUUID(),
    title: "Planned supplies verification",
    amountCents: 5000,
    date: today,
  });
  const report = buildSpendingReport(plan.data.expenses, today, today);
  assert.equal(report.spentCents, 7000);
  assert.equal(report.plannedCents, 5000);
  assert.equal(report.reimbursedCents, 4000);
  const summary = await mutatePersonalWorkspace(owner, {
    op: "summary.generate",
    startDate: today,
    endDate: today,
  });
  assert.equal(summary.summaries[0].snapshot.spending?.spentCents, 7000);
  assert.match(summary.summaries[0].snapshot.text, /Net purchase spending: \$70\.00/);
  // Verify the real direct-to-private-storage flow. Never print signed URLs.
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n3AAAAAASUVORK5CYII=",
    "base64",
  );
  const a = await prepareReceipt(owner, {
    expenseId,
    filename: "verification-receipt.png",
    mimeType: "image/png",
    byteSize: bytes.length,
  });
  const put = await fetch(a.uploadURL, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: bytes,
  });
  assert.ok(put.ok, "Private receipt PUT failed.");
  await completeReceipt(owner, a.attachmentId);
  await completeReceipt(owner, a.attachmentId);
  assert.ok((await downloadReceipt(owner, a.attachmentId)).bytes.equals(bytes));
  await assert.rejects(downloadReceipt(other, a.attachmentId));
  // The old signed PUT can overwrite only the temporary object, never the validated receipt.
  await fetch(a.uploadURL, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: Buffer.from("invalid overwrite"),
  });
  assert.ok((await downloadReceipt(owner, a.attachmentId)).bytes.equals(bytes));
  assert.equal(
    (await expenseWorkspace(owner)).expenses.find((e) => e.id === expenseId)?.attachments.length,
    1,
  );
  console.log(
    "PASS: expense persistence/privacy, source reuse, duplicate protection, stale saves, payment/refund/reimbursement balances, correction rollback/history, period reports, summaries and private receipt round-trip/overwrite protection.",
  );
}
main()
  .catch(() => {
    console.error(
      "Expense verification failed; no credentials or private object URLs were logged.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
