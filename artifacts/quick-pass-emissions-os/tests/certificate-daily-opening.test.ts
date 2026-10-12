import { beforeEach, describe, expect, it, vi } from "vitest";
import { businessDate } from "../src/lib/time";

const mocks = vi.hoisted(() => ({
  balanceRows: [] as { details: unknown; createdAt: Date }[],
  openingRows: [] as { details: unknown; createdAt: Date }[],
  audit: vi.fn(),
  findFirst: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("../src/lib/db", () => ({
  db: {
    auditLog: {
      findFirst: mocks.findFirst,
    },
  },
}));
vi.mock("../src/modules/phase2", () => ({
  approvalRoles: ["OWNER", "ADMIN"],
  BusinessError: class BusinessError extends Error {},
  audit: mocks.audit,
  phase2: async (_actor: string, _roles: string[], work: (tx: unknown) => unknown) =>
    work({ auditLog: { findFirst: mocks.findFirst } }),
}));
vi.mock("../src/modules/station/report", () => ({ digest: () => "test-certificate-scope" }));
vi.mock("../src/modules/certificates/portal-source", () => ({
  fetchCertificateBalance: mocks.fetch,
}));

import {
  CERTIFICATE_BALANCE_ACTION,
  CERTIFICATE_DAILY_START_ACTION,
  CERTIFICATE_PORTAL_SCOPE,
  refreshCertificateBalance,
} from "../src/modules/certificates/portal";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T13:00:00.000Z"));
  mocks.balanceRows.length = 0;
  mocks.openingRows.length = 0;
  mocks.findFirst.mockImplementation(({ where }: { where: { action?: unknown } }) => {
    if (where.action === CERTIFICATE_BALANCE_ACTION) return mocks.balanceRows.at(-1) ?? null;
    if (where.action === CERTIFICATE_DAILY_START_ACTION) return mocks.openingRows[0] ?? null;
    return null;
  });
  mocks.audit.mockImplementation(
    async (_tx: unknown, _actor: string, action: string, entityId: string, details: unknown) => {
      const row = { details, createdAt: new Date() };
      if (entityId !== CERTIFICATE_PORTAL_SCOPE) return;
      if (action === CERTIFICATE_BALANCE_ACTION) mocks.balanceRows.push(row);
      if (action === CERTIFICATE_DAILY_START_ACTION) mocks.openingRows.push(row);
    },
  );
  mocks.fetch.mockReset();
});

describe("daily starting certificate count", () => {
  it("keeps the first successful provider balance recorded for the business day", async () => {
    mocks.fetch.mockResolvedValueOnce(82);
    const firstCheck = await refreshCertificateBalance("owner", true);

    expect(firstCheck.balance).toBe(82);
    expect(firstCheck.startingBalance).toBe(82);
    expect(mocks.openingRows).toHaveLength(1);
    expect(mocks.openingRows[0].details).toMatchObject({
      date: businessDate(),
      balance: 82,
    });

    vi.advanceTimersByTime(16_000);
    mocks.fetch.mockResolvedValueOnce(71);
    const laterCheck = await refreshCertificateBalance("owner", true);

    expect(laterCheck.balance).toBe(71);
    expect(laterCheck.startingBalance).toBe(82);
    expect(mocks.openingRows).toHaveLength(1);
  });
});
