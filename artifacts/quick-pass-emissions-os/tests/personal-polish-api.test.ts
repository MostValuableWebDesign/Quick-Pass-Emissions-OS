import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), polish: vi.fn() }));
vi.mock("@/lib/access", () => ({ currentUser: mocks.user }));
vi.mock("@/modules/personal/polish", () => ({ polishPersonalNote: mocks.polish }));
import { POST } from "@/app/api/personal/polish/route";
const request = (origin = "https://quickpass.example") =>
  new Request("https://quickpass.example/api/personal/polish", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ noteId: "n", version: 1, userId: "forged" }),
  });
describe("private polish API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.mockResolvedValue({ id: "real-owner" });
  });
  it("rejects foreign requests without invoking AI", async () => {
    expect((await POST(request("https://foreign.example"))).status).toBe(403);
    expect(mocks.polish).not.toHaveBeenCalled();
  });
  it("uses the authenticated identity and returns private, noncached suggestions", async () => {
    mocks.polish.mockResolvedValue({ status: "clarify", question: "What happened?", summary: "" });
    const r = await POST(request());
    expect(mocks.polish.mock.calls[0][0]).toBe("real-owner");
    expect(r.headers.get("Cache-Control")).toContain("private, no-store");
  });
  it("reports stale originals without overwriting anything", async () => {
    mocks.polish.mockRejectedValue(new Error("This item changed in another session."));
    expect((await POST(request())).status).toBe(409);
  });
});
