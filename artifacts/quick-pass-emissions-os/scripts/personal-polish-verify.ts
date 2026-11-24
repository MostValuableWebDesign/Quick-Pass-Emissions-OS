import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "../src/lib/db";
import { businessDate } from "../src/lib/time";
import {
  mutatePersonalWorkspace as mutate,
  personalWorkspace,
} from "../src/modules/personal/service";
import { polishPersonalNote } from "../src/modules/personal/polish";
let stage = "fixture";
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Development verification only.");
  const { ids, marker } = JSON.parse(
    await readFile(resolve("work/personal-verification/owned.json"), "utf8"),
  ) as { ids: string[]; marker: string };
  assert.ok(marker.startsWith("Personal workspace verification "));
  for (const id of ids) assert.equal((await db.user.findUnique({ where: { id } }))?.name, marker);
  const [owner, other] = ids;
  const note = await db.personalNote.findFirstOrThrow({
    where: { userId: owner, deletedAt: null },
  });
  const raw = "called repair guy about bay 2";
  let data = await mutate(owner, {
    op: "note.save",
    id: note.id,
    version: note.version,
    title: "Repair call",
    body: raw,
    checklist: [],
    folderId: null,
    pinned: false,
  });
  const current = () => data.notes.find((n) => n.id === note.id)!;
  // Live synthetic AI check: selected note only. Never print source or provider replies.
  stage = "clarification";
  const question = await polishPersonalNote(owner, {
    noteId: note.id,
    version: current().version,
    answers: [],
  });
  assert.equal(question.status, "clarify");
  assert.ok(question.question);
  const answers = [
    {
      question: question.question,
      answer: "I scheduled a repair visit. No repair has happened yet.",
    },
  ];
  await new Promise((r) => setTimeout(r, 3100));
  stage = "confirmed rewrite";
  const suggestion = await polishPersonalNote(owner, {
    noteId: note.id,
    version: current().version,
    answers,
  });
  assert.equal(suggestion.status, "ready");
  assert.match(suggestion.summary, /schedul/i);
  assert.doesNotMatch(suggestion.summary, /successfully repaired|completed the repair|restored/i);
  stage = "review and persistence";
  assert.equal(
    (await db.personalNote.findUniqueOrThrow({ where: { id: note.id } })).polishedSummary,
    "",
  );
  await assert.rejects(
    polishPersonalNote(other, { noteId: note.id, version: current().version, answers: [] }),
  );
  await assert.rejects(
    mutate(other, {
      op: "note.summary.save",
      id: note.id,
      version: current().version,
      text: suggestion.summary,
      answers,
    }),
  );
  const sourceVersion = current().version;
  data = await mutate(owner, {
    op: "note.summary.save",
    id: note.id,
    version: sourceVersion,
    text: suggestion.summary,
    answers,
  });
  assert.equal(current().body, raw);
  assert.ok(current().polishedOriginal.includes(raw));
  assert.equal(current().polishedSummary, suggestion.summary);
  assert.equal(current().polishedCurrent, true);
  await assert.rejects(
    mutate(owner, {
      op: "note.summary.save",
      id: note.id,
      version: sourceVersion,
      text: "Stale",
      answers: [],
    }),
  );
  stage = "linked task";
  data = await mutate(owner, { op: "task.convert", noteId: note.id });
  let task = data.tasks.find((t) => t.sourceKey === `note:${note.id}`)!;
  assert.equal(task.status, "TODO");
  assert.equal(task.description, suggestion.summary);
  data = await mutate(owner, { op: "task.save", ...task, status: "COMPLETED", completionNote: "" });
  task = data.tasks.find((t) => t.id === task.id)!;
  assert.equal(task.completionNote, suggestion.summary);
  assert.ok(task.completedAt);
  const completedAt = task.completedAt;
  const edited = suggestion.summary + " No repair had taken place at the time of the call.";
  data = await mutate(owner, {
    op: "note.summary.save",
    id: note.id,
    version: current().version,
    text: edited,
    answers,
  });
  task = data.tasks.find((t) => t.id === task.id)!;
  assert.equal(task.completionNote, edited);
  assert.equal(task.completedAt, completedAt);
  stage = "biweekly summary";
  const today = businessDate();
  data = await mutate(owner, { op: "summary.generate", startDate: today, endDate: today });
  const summary = data.summaries.find((s) => s.startDate === today && s.endDate === today)!;
  assert.equal(summary.snapshot.completed.find((t) => t.id === task.id)?.completionNote, edited);
  assert.equal(
    (await personalWorkspace(other)).notes.some((n) => n.id === note.id),
    false,
  );
  // A later raw-note edit must not erase the approved wording or its original reference.
  data = await mutate(owner, {
    op: "note.save",
    id: note.id,
    version: current().version,
    title: "Repair call",
    body: raw + "; waiting on visit",
    checklist: [],
    folderId: null,
    pinned: false,
  });
  assert.equal(current().polishedSummary, edited);
  assert.ok(current().polishedOriginal.includes(raw));
  assert.equal(current().polishedCurrent, false);
  console.log(
    "Passed live clarification and rewrite, review-only saving, privacy, stale-edit rejection, original preservation, completed-task wording and biweekly summary checks.",
  );
}
main()
  .catch((error) => {
    console.error(
      "Personal work-summary verification failed at",
      stage,
      error instanceof Error ? error.name : "UnknownError",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
