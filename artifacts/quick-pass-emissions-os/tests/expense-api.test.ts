import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  read: vi.fn(),
  mutate: vi.fn(),
  prepare: vi.fn(),
  complete: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/lib/access", () => ({ currentUser: mocks.user }));
vi.mock("@/modules/personal/expense-service", async () => {
  const { z } = await import("zod");
  return {
    expenseWorkspace: mocks.read,
    mutateExpenseWorkspace: mocks.mutate,
    expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  };
});
vi.mock("@/modules/personal/expense-storage", () => ({
  prepareReceipt: mocks.prepare,
  completeReceipt: mocks.complete,
  downloadReceipt: mocks.download,
}));
import { GET, POST } from "@/app/api/personal/expenses/route";
import { GET as report } from "@/app/api/personal/expenses/report/route";
import { POST as attachments } from "@/app/api/personal/expenses/attachments/route";
import { GET as download } from "@/app/api/personal/expenses/attachments/[id]/route";
const request = (path: string, body: unknown, origin = "https://quickpass.example") =>
  new Request(`https://quickpass.example/api/personal/expenses${path}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
describe("expense API privacy and failures", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.mockResolvedValue({ id: "session-owner" });
    mocks.read.mockResolvedValue({ expenses: [], today: "2026-11-24", notes: [], tasks: [] });
    mocks.mutate.mockResolvedValue({ data: { expenses: [] } });
  });
  it("reads only the authenticated account and disables shared caching", async () => {
    const response = await GET();
    expect(mocks.read).toHaveBeenCalledWith("session-owner");
    expect(response.headers.get("Cache-Control")).toContain("private, no-store");
  });
  it("rejects foreign-origin edits before any mutation", async () => {
    const response = await POST(request("", { op: "expense.create" }, "https://foreign.example"));
    expect(response.status).toBe(403);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("uses session identity for edits and exposes stale-save conflicts", async () => {
    mocks.mutate.mockRejectedValue(new Error("This expense changed in another session."));
    const response = await POST(request("", { op: "expense.save", userId: "forged-owner" }));
    expect(mocks.mutate.mock.calls[0][0]).toBe("session-owner");
    expect(response.status).toBe(409);
  });
  it("provides private, dated CSV exports and rejects reversed ranges", async () => {
    const csv = await report(
      new Request(
        "https://quickpass.example/api/personal/expenses/report?start=2026-11-01&end=2026-11-24&format=csv",
      ),
    );
    expect(csv.headers.get("Content-Type")).toContain("text/csv");
    expect(csv.headers.get("Content-Disposition")).toContain("2026-11-01-2026-11-24.csv");
    const invalid = await report(
      new Request(
        "https://quickpass.example/api/personal/expenses/report?start=2026-12-01&end=2026-11-01",
      ),
    );
    expect(invalid.status).toBe(400);
  });
  it("requires trusted origin and session owner for attachment preparation", async () => {
    const response = await attachments(
      request("/attachments", { op: "prepare", expenseId: "expense" }, "https://foreign.example"),
    );
    expect(response.status).toBe(403);
    expect(mocks.prepare).not.toHaveBeenCalled();
    mocks.prepare.mockResolvedValue({ attachmentId: "test" });
    await attachments(
      request("/attachments", { op: "prepare", expenseId: "expense", userId: "forged-owner" }),
    );
    expect(mocks.prepare.mock.calls[0][0]).toBe("session-owner");
  });
  it("checks receipt ownership before bytes are returned and makes unavailable files indistinguishable", async () => {
    mocks.download.mockRejectedValue(new Error("Receipt unavailable."));
    const response = await download(new Request("https://quickpass.example"), {
      params: Promise.resolve({ id: "receipt" }),
    });
    expect(mocks.download).toHaveBeenCalledWith("session-owner", "receipt");
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Receipt unavailable.");
  });
});
