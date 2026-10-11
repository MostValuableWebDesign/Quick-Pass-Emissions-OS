import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  if (!url.pathname.endsWith("_test")) throw new Error("Test database name must end in _test");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.BETTER_AUTH_URL = "https://password.example.test";
  process.env.BETTER_AUTH_SECRET = randomUUID() + randomUUID();
}
const suite = enabled ? describe : describe.skip;
const origin = "https://password.example.test";

suite("Isolated authenticated password changes", () => {
  let auth: typeof import("../src/lib/auth").auth;
  let db: typeof import("../src/lib/db").db;
  let post: typeof import("../src/app/api/auth/change-own-password/route").POST;
  const ids: string[] = [];
  // Random test-only credentials stay in memory and are never asserted/printed.
  let oldPassword: string;
  let newPassword: string;
  let wrongPassword: string;

  function cookies(response: Response) {
    return response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  }
  function call(route: string, body: unknown, cookie = "", requestOrigin: string | null = origin) {
    const headers = new Headers({ "content-type": "application/json" });
    if (cookie) headers.set("cookie", cookie);
    if (requestOrigin !== null) headers.set("origin", requestOrigin);
    return auth.handler(
      new Request(`${origin}/api/auth/${route}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    );
  }
  async function fixture(role: "OWNER" | "ADMIN" | "EMPLOYEE" | "BOOKKEEPER") {
    const user = await db.user.create({
      data: { name: "Password fixture", email: `${randomUUID()}@example.test`, role },
    });
    ids.push(user.id);
    await db.account.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: await hashPassword(oldPassword),
      },
    });
    return user;
  }
  async function login(email: string, password = oldPassword) {
    return call("sign-in/email", { email, password });
  }
  function form(cookie: string, overrides: Record<string, string> = {}, requestOrigin = origin) {
    return post(
      new Request(`${origin}/api/auth/change-own-password`, {
        method: "POST",
        headers: { cookie, origin: requestOrigin },
        body: new URLSearchParams({
          currentPassword: oldPassword,
          newPassword,
          confirmPassword: newPassword,
          ...overrides,
        }),
      }),
    );
  }
  async function session(cookie: string) {
    const response = await auth.handler(
      new Request(`${origin}/api/auth/get-session`, {
        headers: { cookie },
      }),
    );
    const body = await response.json();
    return body?.user?.id ?? null;
  }
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    auth = (await import("../src/lib/auth")).auth;
    post = (await import("../src/app/api/auth/change-own-password/route")).POST;
  });
  beforeEach(async () => {
    oldPassword = randomUUID();
    newPassword = randomUUID();
    wrongPassword = randomUUID();
    await db.rateLimit.deleteMany();
  });
  afterAll(async () => {
    await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it.each(["EMPLOYEE", "BOOKKEEPER"] as const)(
    "denies legacy %s credentials and demoted sessions",
    async (role) => {
      const user = await fixture(role);
      expect((await login(user.email)).ok).toBe(false);
      expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
      await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
      const cookie = cookies(await login(user.email));
      expect(await session(cookie)).toBe(user.id);
      await db.user.update({ where: { id: user.id }, data: { role } });
      expect(await session(cookie)).toBeNull();
      expect(
        (await call("change-password", { currentPassword: oldPassword, newPassword }, cookie))
          .status,
      ).toBe(403);
      const credential = await db.account.findFirstOrThrow({ where: { userId: user.id } });
      expect(await verifyPassword({ hash: credential.password!, password: oldPassword })).toBe(
        true,
      );
    },
  );

  it.each(["OWNER", "ADMIN"] as const)(
    "%s changes only their own password, rotates sessions and records a safe audit",
    async (role) => {
      const user = await fixture(role);
      const other = await fixture("ADMIN");
      const first = await login(user.email);
      const second = await login(user.email);
      expect(first.ok && second.ok).toBe(true);
      const initialCookie = cookies(first),
        otherCookie = cookies(second);
      const accountBefore = await db.account.findFirstOrThrow({ where: { userId: other.id } });

      const wrong = await form(initialCookie, { currentPassword: wrongPassword });
      expect(wrong.headers.get("location")).toBe("/settings/account?error=current");
      expect(await db.auditLog.count({ where: { actorId: user.id } })).toBe(0);
      expect(await session(initialCookie)).toBe(user.id);

      const result = await form(initialCookie);
      expect(result.status).toBe(303);
      expect(result.headers.get("location")).toBe("/settings/account?changed=1");
      expect(await session(initialCookie)).toBeNull();
      expect(await session(otherCookie)).toBeNull();
      expect(await session(cookies(result))).toBe(user.id);
      expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
      expect((await login(user.email)).ok).toBe(false);
      expect((await login(user.email, newPassword)).ok).toBe(true);

      const accountAfter = await db.account.findFirstOrThrow({ where: { userId: other.id } });
      expect(accountAfter.password === accountBefore.password).toBe(true);
      const audits = await db.auditLog.findMany({ where: { actorId: user.id } });
      expect(audits).toHaveLength(1);
      expect(audits[0].entityId).toBe(user.id);
      expect(audits[0].action).toBe("PASSWORD_CHANGED");
      expect(audits[0].details).toEqual({
        source: "self_service",
        sessionPolicy: "rotate-current-revoke-others",
      });
      expect(
        [oldPassword, newPassword, wrongPassword, accountAfter.password!].some((secret) =>
          JSON.stringify(audits).includes(secret),
        ),
      ).toBe(false);
    },
  );

  it("rejects unauthenticated, cross-site and missing-origin submissions", async () => {
    const user = await fixture("ADMIN");
    const cookie = cookies(await login(user.email));
    expect((await form("")).headers.get("location")).toBe("/login");
    for (const requestOrigin of ["https://attacker.example.test", null]) {
      const result = await call(
        "change-password",
        {
          currentPassword: oldPassword,
          newPassword,
        },
        cookie,
        requestOrigin,
      );
      expect(result.ok).toBe(false);
    }
    expect((await form(cookie, {}, "https://attacker.example.test")).headers.get("location")).toBe(
      "/settings/account?error=security",
    );
    expect(await db.auditLog.count({ where: { actorId: user.id } })).toBe(0);
  });

  it("rejects an inactive user even with an existing session", async () => {
    const user = await fixture("ADMIN");
    const cookie = cookies(await login(user.email));
    await db.user.update({ where: { id: user.id }, data: { active: false } });
    expect((await form(cookie)).headers.get("location")).toBe("/settings/account?error=security");
    expect(
      (
        await call(
          "change-password",
          {
            currentPassword: oldPassword,
            newPassword,
          },
          cookie,
        )
      ).ok,
    ).toBe(false);
    expect(await db.auditLog.count({ where: { actorId: user.id } })).toBe(0);
  });

  it("rejects invalid lengths, mismatched confirmation and target-user form fields", async () => {
    const user = await fixture("OWNER");
    const cookie = cookies(await login(user.email));
    const cases: Record<string, string>[] = [
      { newPassword: "x".repeat(11), confirmPassword: "x".repeat(11) },
      { newPassword: "x".repeat(129), confirmPassword: "x".repeat(129) },
      { confirmPassword: wrongPassword },
      { userId: randomUUID() },
      { email: "other@example.test" },
    ];
    for (const overrides of cases) {
      expect((await form(cookie, overrides)).headers.get("location")).toBe(
        "/settings/account?error=validation",
      );
    }
    for (const value of ["x".repeat(11), "x".repeat(129)]) {
      expect(
        (
          await call(
            "change-password",
            {
              currentPassword: oldPassword,
              newPassword: value,
            },
            cookie,
          )
        ).ok,
      ).toBe(false);
    }
    expect(await db.auditLog.count({ where: { actorId: user.id } })).toBe(0);
  });

  it("direct supported endpoint cannot target someone else or disable session revocation", async () => {
    const user = await fixture("ADMIN");
    const other = await fixture("OWNER");
    const first = cookies(await login(user.email)),
      second = cookies(await login(user.email));
    const response = await call(
      "change-password",
      {
        currentPassword: oldPassword,
        newPassword,
        revokeOtherSessions: false,
        userId: other.id,
        email: other.email,
      },
      first,
    );
    expect(response.ok).toBe(true);
    expect(await session(first)).toBeNull();
    expect(await session(second)).toBeNull();
    expect(await session(cookies(response))).toBe(user.id);
    const otherAccount = await db.account.findFirstOrThrow({ where: { userId: other.id } });
    expect(await verifyPassword({ hash: otherAccount.password!, password: oldPassword })).toBe(
      true,
    );
    expect(await db.auditLog.count({ where: { actorId: user.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { actorId: other.id } })).toBe(0);
  });

  it("throttles repeated failed current-password attempts", async () => {
    const user = await fixture("ADMIN");
    const cookie = cookies(await login(user.email));
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await form(cookie, { currentPassword: wrongPassword })).headers.get("location")).toBe(
        "/settings/account?error=current",
      );
    }
    expect((await form(cookie)).headers.get("location")).toBe("/settings/account?error=rate_limit");
    expect(await db.auditLog.count({ where: { actorId: user.id } })).toBe(0);
  });
});

describe("Credential form safety", () => {
  it("renders a native POST form and checks the active user server-side", () => {
    const source = readFileSync(path.resolve("src/app/(app)/settings/account/page.tsx"), "utf8");
    expect(source.includes('method="post"')).toBe(true);
    expect(source.includes('action="/api/auth/change-own-password"')).toBe(true);
    expect(source.includes("await currentUser()")).toBe(true);
    expect(source.includes('type="password"')).toBe(true);
    expect(source.includes('autoComplete="current-password"')).toBe(true);
    expect(source.includes('autoComplete="new-password"')).toBe(true);
  });
});
