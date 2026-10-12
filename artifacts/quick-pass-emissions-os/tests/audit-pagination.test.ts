import { describe, expect, it } from "vitest";
import { getAuditPagination } from "../src/lib/audit-pagination";

describe("audit history pagination", () => {
  it("shows 15 records per page with the correct range", () => {
    expect(getAuditPagination(41, "2")).toEqual({
      page: 2,
      pageCount: 3,
      skip: 15,
      take: 15,
      rangeStart: 16,
      rangeEnd: 30,
    });
  });

  it("clamps invalid and out-of-range pages safely", () => {
    expect(getAuditPagination(20, "nope").page).toBe(1);
    expect(getAuditPagination(20, "0").page).toBe(1);
    expect(getAuditPagination(20, "9")).toMatchObject({
      page: 2,
      pageCount: 2,
      skip: 15,
      rangeStart: 16,
      rangeEnd: 20,
    });
  });

  it("keeps empty history on a valid first page", () => {
    expect(getAuditPagination(0)).toEqual({
      page: 1,
      pageCount: 1,
      skip: 0,
      take: 15,
      rangeStart: 0,
      rangeEnd: 0,
    });
  });
});
