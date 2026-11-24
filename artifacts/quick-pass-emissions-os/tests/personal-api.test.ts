import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  read: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock("@/lib/access", () => ({ currentUser: mocks.user }));
vi.mock("@/modules/personal/service", () => ({
  personalWorkspace: mocks.read,
  mutatePersonalWorkspace: mocks.mutate,
}));
import { GET, POST } from "@/app/api/personal/route";

describe("personal workspace API boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.mockResolvedValue({ id: "current-account" });
    mocks.read.mockResolvedValue({ notes: [] });
    mocks.mutate.mockResolvedValue({ notes: [] });
  });
  it("reads private data using server session identity and no-store caching", async () => {
    const response = await GET();
    expect(mocks.read).toHaveBeenCalledWith("current-account");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("does not read records when authentication fails", async () => {
    mocks.user.mockRejectedValue(new Error("Sign in required"));
    await expect(GET()).rejects.toThrow("Sign in required");
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([undefined, "https://untrusted.example"])(
    "rejects missing or foreign Origin %s",
    async (origin) => {
      const response = await POST(
        new Request("https://quickpass.example/api/personal", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
          body: JSON.stringify({ op: "note.create", id: "note" }),
        }),
      );
      expect(response.status).toBe(403);
      expect(mocks.mutate).not.toHaveBeenCalled();
    },
  );
  it("takes the actor from the server session, never a posted user ID", async () => {
    const command = { op: "note.create", id: "note", userId: "another-account" };
    await POST(
      new Request("https://quickpass.example/api/personal", {
        method: "POST",
        headers: { Origin: "https://quickpass.example", "Content-Type": "application/json" },
        body: JSON.stringify(command),
      }),
    );
    expect(mocks.mutate).toHaveBeenCalledWith("current-account", command);
  });
  it("returns an explicit conflict response rather than pretending to save", async () => {
    mocks.mutate.mockRejectedValue(
      new Error("This item changed in another session. Reload the latest version."),
    );
    const response = await POST(
      new Request("https://quickpass.example/api/personal", {
        method: "POST",
        headers: { Origin: "https://quickpass.example", "Content-Type": "application/json" },
        body: JSON.stringify({ op: "note.save" }),
      }),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("changed in another session");
  });
});
