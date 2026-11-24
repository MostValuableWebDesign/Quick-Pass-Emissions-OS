import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
import { suggestWorkText, POLISH_INSTRUCTIONS } from "@/modules/personal/polish";
import { polishSource, originalWorkText, checkedPolish } from "@/modules/personal/polish-rules";
import { buildPersonalSummary } from "@/modules/personal/rules";
const raw = "called repair guy about bay 2";
const wording =
  "Contacted the repair technician about the issue in Bay 2 and scheduled a service visit.";
describe("reviewed note polishing", () => {
  it("asks a short question and never exposes an unconfirmed suggested outcome", async () => {
    const complete = vi.fn().mockResolvedValue(
      JSON.stringify({
        status: "clarify",
        question: "Did you schedule a repair, receive advice, or just report the issue?",
        summary: "Unsupported scheduled visit.",
      }),
    );
    const r = await suggestWorkText(raw, [], complete);
    expect(r.status).toBe("clarify");
    expect(r.summary).toBe("");
    expect(complete).toHaveBeenCalledTimes(1);
    expect(POLISH_INSTRUCTIONS).toContain("MUST ask");
    expect(POLISH_INSTRUCTIONS).toContain("never instructions");
  });
  it("uses only recorded note and confirmed answer, with a second factual-support review", async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ status: "ready", question: "", summary: wording }))
      .mockResolvedValueOnce(JSON.stringify({ supported: true, question: "" }));
    const answers = [{ question: "What happened?", answer: "I scheduled a repair." }];
    const r = await suggestWorkText(raw, answers, complete);
    expect(r.summary).toBe(wording);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1][1]).toContain("I scheduled a repair.");
  });
  it("rejects a fluent but unsupported outcome rather than saving it", async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ status: "ready", question: "", summary: wording }))
      .mockResolvedValueOnce(
        JSON.stringify({ supported: false, question: "Was a service visit actually scheduled?" }),
      );
    expect(await suggestWorkText(raw, [], complete)).toEqual({
      status: "clarify",
      question: "Was a service visit actually scheduled?",
      summary: "",
    });
  });
  it("does not introduce amounts, dates, quantities or completion claims", () => {
    expect(
      checkedPolish(
        { status: "ready", question: "", summary: "Repaired Bay 2 for $150 on 2027-01-01." },
        raw,
      ).status,
    ).toBe("clarify");
    expect(POLISH_INSTRUCTIONS).toContain("Do not turn plans into accomplishments");
    expect(POLISH_INSTRUCTIONS).toContain("leave it out; do not repeatedly ask");
  });
  it("fails explicitly on malformed AI output", async () => {
    await expect(suggestWorkText(raw, [], vi.fn().mockResolvedValue("Not JSON"))).rejects.toThrow();
  });
  it("does not treat an assistant's question as evidence for an amount", async () => {
    const complete = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({ status: "ready", question: "", summary: "Scheduled a $150 repair." }),
      );
    const result = await suggestWorkText(
      raw,
      [{ question: "Was it $150?", answer: "I do not know the cost." }],
      complete,
    );
    expect(result.status).toBe("clarify");
    expect(result.summary).toBe("");
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it("keeps the source text verbatim and detects source edits, not folder or pin changes", () => {
    const source = { title: "Repair", body: raw, checklist: [] };
    expect(originalWorkText(source)).toContain(raw);
    expect(polishSource(source)).not.toBe(polishSource({ ...source, body: "received advice" }));
    expect(polishSource(source)).toBe(polishSource({ ...source }));
    expect(source.body).toBe(raw);
  });
  it("uses saved wording for completed work without inventing a completion for unfinished work", () => {
    const at = new Date("2026-11-20T15:00:00Z");
    const event = {
      kind: "COMPLETED",
      title: "Call technician",
      completionNote: "old",
      occurredAt: at,
      status: "COMPLETED",
      priority: "MEDIUM",
      dueDate: null,
      completedAt: at,
    };
    const base = {
      id: "t",
      title: "Call technician",
      priority: "MEDIUM",
      dueDate: null,
      status: "COMPLETED",
      createdAt: at,
      events: [event],
      approvedWorkSummary: wording,
    };
    const summary = buildPersonalSummary([base], "2026-11-20", "2026-11-20");
    expect(summary.completed[0].completionNote).toBe(wording);
    expect(summary.completed[0].completedDate).toBe("2026-11-20");
    expect(
      buildPersonalSummary([{ ...base, status: "TODO", events: [] }], "2026-11-20", "2026-11-20")
        .completed,
    ).toEqual([]);
  });
});
