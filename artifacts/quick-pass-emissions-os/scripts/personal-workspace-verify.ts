/** Synthetic-account-only verification. Never edits existing users or business records. */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/lib/db";
import { businessDate } from "../src/lib/time";
import {
  mutatePersonalWorkspace as mutate,
  personalWorkspace,
} from "../src/modules/personal/service";

const dir = resolve("work/personal-verification");
const registry = resolve(dir, "owned.json");
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Development verification only.");
  if (process.argv[2] === "cleanup") {
    const { ids, marker } = JSON.parse(await readFile(registry, "utf8")) as {
      ids: string[];
      marker: string;
    };
    for (const id of ids) {
      const user = await db.user.findUnique({ where: { id } });
      assert.equal(user?.name, marker, "Fixture ownership mismatch.");
      await db.user.delete({ where: { id } });
    }
    await rm(dir, { recursive: true });
    console.log(
      "Removed only owned personal-workspace verification accounts and their private files.",
    );
    return;
  }
  await mkdir(dir, { recursive: true, mode: 0o700 });
  try {
    await readFile(registry);
    throw new Error("Clean up existing verification records first.");
  } catch (e) {
    if (!(e && typeof e === "object" && "code" in e && e.code === "ENOENT")) throw e;
  }
  const marker = `Personal workspace verification ${randomUUID()}`;
  const email = `${randomUUID()}@personal-verification.example.test`;
  const password = randomBytes(32).toString("base64url");
  const owner = await db.user.create({
    data: { name: marker, email, emailVerified: true, role: "OWNER" },
  });
  const other = await db.user.create({
    data: {
      name: marker,
      email: `${randomUUID()}@personal-verification.example.test`,
      role: "ADMIN",
    },
  });
  await writeFile(registry, JSON.stringify({ ids: [owner.id, other.id], marker }), { mode: 0o600 });
  await db.account.create({
    data: {
      id: randomUUID(),
      userId: owner.id,
      accountId: owner.id,
      providerId: "credential",
      password: await hashPassword(password),
    },
  });
  let data = await mutate(owner.id, {
    op: "note.create",
    id: randomUUID(),
    title: "Verification idea",
  });
  const noteId = data.notes[0].id;
  const save = (note: (typeof data.notes)[number], extra: object = {}) => ({
    op: "note.save",
    id: note.id,
    version: note.version,
    title: note.title,
    body: note.body,
    checklist: note.checklist,
    pinned: note.pinned,
    folderId: note.folderId,
    ...extra,
  });
  data = await mutate(
    owner.id,
    save(data.notes[0], {
      body: "A saved business idea",
      checklist: [{ id: "fixture-item", text: "Call supplier", checked: false }],
    }),
  );
  await assert.rejects(mutate(other.id, save(data.notes[0], { body: "Unauthorized" })));
  assert.equal((await personalWorkspace(other.id)).notes.length, 0);
  await assert.rejects(mutate(owner.id, save({ ...data.notes[0], version: 1 })));
  data = await mutate(owner.id, { op: "task.convert", noteId, itemId: "fixture-item" });
  data = await mutate(owner.id, { op: "task.convert", noteId, itemId: "fixture-item" });
  assert.equal(data.tasks.length, 1, "Conversion must be duplicate-safe.");
  let task = data.tasks[0];
  const taskSave = (extra: object) => ({
    op: "task.save",
    id: task.id,
    version: task.version,
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueDate: task.dueDate,
    status: task.status,
    completionNote: task.completionNote,
    ...extra,
  });
  data = await mutate(
    owner.id,
    taskSave({ status: "COMPLETED", completionNote: "Supplier called" }),
  );
  assert.ok(data.tasks[0].completedAt);
  task = data.tasks[0];
  data = await mutate(owner.id, taskSave({ status: "TODO" }));
  assert.equal(data.tasks[0].completedAt, null);
  assert.equal(
    await db.personalTaskEvent.count({ where: { taskId: task.id, kind: "REOPENED" } }),
    1,
  );
  task = data.tasks[0];
  data = await mutate(
    owner.id,
    taskSave({ status: "COMPLETED", completionNote: "Order confirmed" }),
  );
  data = await mutate(owner.id, {
    op: "summary.generate",
    startDate: businessDate(),
    endDate: businessDate(),
  });
  data = await mutate(owner.id, {
    op: "summary.generate",
    startDate: businessDate(),
    endDate: businessDate(),
  });
  assert.equal(data.summaries.length, 1);
  assert.equal(data.summaries[0].snapshot.completed.length, 1);
  assert.equal(data.summaries[0].snapshot.reopened.length, 1);
  assert.match(data.summaries[0].snapshot.text, /Order confirmed/);
  const summaryId = data.summaries[0].id;
  task = data.tasks[0];
  data = await mutate(owner.id, taskSave({ completionNote: "Refreshed accomplishment" }));
  data = await mutate(owner.id, {
    op: "summary.generate",
    startDate: businessDate(),
    endDate: businessDate(),
  });
  assert.equal(data.summaries[0].id, summaryId);
  assert.match(data.summaries[0].snapshot.text, /Refreshed accomplishment/);
  await assert.rejects(mutate(other.id, taskSave({})));
  data = await mutate(owner.id, { op: "note.delete", id: noteId, version: data.notes[0].version });
  assert.ok(data.notes[0].deletedAt);
  data = await mutate(owner.id, { op: "note.restore", id: noteId, version: data.notes[0].version });
  assert.equal(data.notes[0].deletedAt, null);
  assert.equal(data.notes[0].body, "A saved business idea");
  const standaloneId = randomUUID();
  const standalone = { op: "task.create", id: standaloneId, title: "Standalone identity check" };
  data = await mutate(owner.id, standalone);
  data = await mutate(owner.id, standalone);
  assert.equal(data.tasks.filter((t) => t.id === standaloneId).length, 1);
  // Private handoff to browser tester; credentials are never printed.
  await writeFile(resolve(dir, "login.json"), JSON.stringify({ email, password }), { mode: 0o600 });
  console.log(
    "PASS: database persistence, account isolation, stale-edit protection, duplicate-safe conversion and summary, completion/reopening history, delete/restore.",
  );
  console.log("Private browser credentials prepared in the owned verification directory.");
}
main()
  .catch(() => {
    console.error("Personal workspace verification failed; inspect the synthetic fixture locally.");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
