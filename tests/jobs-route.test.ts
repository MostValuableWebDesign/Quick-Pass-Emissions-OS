import { afterEach, describe, expect, it, vi } from "vitest";
const run = vi.hoisted(() => vi.fn(async () => ({ generated: 0, runId: "test" })));
vi.mock("@/modules/tasks/jobs", () => ({ runJobs: run }));
import { POST } from "../src/app/api/jobs/route";
const previous = process.env.CRON_SECRET;
afterEach(() => {
  if (previous === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previous;
  run.mockClear();
});
describe("Scheduled endpoint authentication", () => {
  it("rejects absent configuration and invalid bearer credentials", async () => {
    delete process.env.CRON_SECRET;
    expect(
      (await POST(new Request("https://example.test/api/jobs", { method: "POST" }))).status,
    ).toBe(401);
    process.env.CRON_SECRET = "a".repeat(32);
    for (const value of ["Bearer invalid", `Bearer ${"ü".repeat(32)}`, `Bearer ${"b".repeat(32)}`])
      expect(
        (
          await POST(
            new Request("https://example.test/api/jobs", {
              method: "POST",
              headers: { authorization: value },
            }),
          )
        ).status,
      ).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });
  it("executes only with the configured bearer token", async () => {
    process.env.CRON_SECRET = "a".repeat(32);
    expect(
      (
        await POST(
          new Request("https://example.test/api/jobs", {
            method: "POST",
            headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
          }),
        )
      ).status,
    ).toBe(200);
    expect(run).toHaveBeenCalledOnce();
  });
});
