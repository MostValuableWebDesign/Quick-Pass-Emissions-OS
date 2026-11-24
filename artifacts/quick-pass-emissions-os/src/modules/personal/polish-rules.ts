import { createHash } from "node:crypto";
import { z } from "zod";
export const clarification = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(3000),
});
export type Clarification = z.infer<typeof clarification>;
export const polishInput = z.object({
  noteId: z.string().min(1).max(160),
  version: z.number().int().positive(),
  answers: z.array(clarification).max(8).default([]),
});
export const polishOutput = z.object({
  status: z.enum(["clarify", "ready"]),
  question: z.string().max(500),
  summary: z.string().max(12000),
});
export type PolishOutput = z.infer<typeof polishOutput>;
export type PolishSource = { title: string; body: string; checklist: unknown };
export const polishSource = (note: PolishSource) =>
  createHash("sha256")
    .update(JSON.stringify([note.title, note.body, note.checklist]))
    .digest("hex");
export function originalWorkText(note: PolishSource) {
  const list = z
    .array(z.object({ text: z.string(), checked: z.boolean() }))
    .safeParse(note.checklist);
  return [
    note.title,
    note.body,
    ...(list.success ? list.data.map((c) => `${c.checked ? "[x]" : "[ ]"} ${c.text}`) : []),
  ]
    .filter(Boolean)
    .join("\n\n");
}
/** Quotes/numbers cannot supply missing facts. Semantic support is checked separately by the reviewer. */
export function unsupportedNumbers(text: string, source: string) {
  const existing = new Set(source.match(/\d+(?:[.,:/-]\d+)*/g) ?? []);
  return (text.match(/\d+(?:[.,:/-]\d+)*/g) ?? []).some((n) => !existing.has(n));
}
export function checkedPolish(output: PolishOutput, source: string): PolishOutput {
  if (output.status === "clarify") {
    if (!output.question.trim())
      throw new Error("The assistant did not return a clarification question. Please try again.");
    return { ...output, summary: "" };
  }
  if (!output.summary.trim()) throw new Error("No wording was suggested. Please try again.");
  if (unsupportedNumbers(output.summary, source))
    return {
      status: "clarify",
      question: "Can you confirm the dates, quantities or amounts you want included?",
      summary: "",
    };
  return { ...output, question: "" };
}
