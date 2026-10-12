import { describe, it, expect } from "vitest";
import { rentalMonth, paymentSummary } from "../src/modules/rentals/rules";
import { agreementInput } from "../src/modules/rentals/service";
import { movementInput } from "../src/modules/chemicals/service";
import { unverifiedVendorInput, vendorInput } from "../src/modules/maintenance/validation";
describe("Phase 3 calendar, money and validation", () => {
  it("clamps payment due days at leap and non-leap month ends", () => {
    expect(rentalMonth("2028-02", 31).dueDate).toBe("2028-02-29");
    expect(rentalMonth("2026-04", 31).dueDate).toBe("2026-04-30");
    expect(rentalMonth("2026-01", 31).dueDate).toBe("2026-01-31");
  });
  it("distinguishes recorded partial, overdue, paid and voided charges exactly", () => {
    expect(paymentSummary(10001, [{ amountCents: 1 }], "2026-10-10", "2026-10-10")).toEqual({
      paidCents: 1,
      remainingCents: 10000,
      status: "Partially paid",
    });
    expect(
      paymentSummary(
        10001,
        [{ amountCents: 10001 }, { amountCents: -10001 }],
        "2026-10-09",
        "2026-10-10",
      ).status,
    ).toBe("Overdue");
    expect(paymentSummary(10001, [{ amountCents: 10001 }], "2026-10-09", "2026-10-10").status).toBe(
      "Paid",
    );
    expect(paymentSummary(10001, [], "2026-10-09", "2026-10-10", true).status).toBe("Voided");
  });
  it("rejects fractional cents, impossible agreement dates, and missing verification contacts", () => {
    const data = {
      bayId: "bay",
      tenant: "Tenant",
      contact: "Checked contact",
      reference: "ref",
      startDate: "2026-01-01",
      endDate: "",
      monthlyCents: 10001,
      dueDay: 31,
      responsibilities: "Terms",
      reason: "Verified",
    };
    expect(agreementInput.safeParse(data).success).toBe(true);
    expect(agreementInput.safeParse({ ...data, monthlyCents: 1.1 }).success).toBe(false);
    expect(agreementInput.safeParse({ ...data, startDate: "2026-02-30" }).success).toBe(false);
    expect(
      vendorInput.safeParse({
        version: 0,
        name: "Vendor",
        contact: "Support",
        phone: "",
        email: "",
        services: "Services",
        reference: "ref",
        verifiedDate: "2026-01-01",
        active: true,
        reason: "checked",
      }).success,
    ).toBe(false);
  });
  it("allows only vendor name and phone to be required for an unverified vendor", () => {
    const minimal = { name: "New vendor", phone: "555-0100" };
    expect(unverifiedVendorInput.safeParse(minimal).success).toBe(true);
    expect(unverifiedVendorInput.safeParse({ ...minimal, phone: "555-fixture" }).success).toBe(
      false,
    );
    expect(unverifiedVendorInput.safeParse({ ...minimal, email: "not-an-email" }).success).toBe(
      false,
    );
    expect(unverifiedVendorInput.safeParse({ name: "", phone: "555-0100" }).success).toBe(false);
    expect(unverifiedVendorInput.safeParse({ name: "New vendor", phone: "" }).success).toBe(false);
    const forged = unverifiedVendorInput.parse({
      ...minimal,
      active: false,
      verifiedDate: "2026-10-01",
    });
    expect(forged).not.toHaveProperty("active");
    expect(forged).not.toHaveProperty("verifiedDate");
  });
  it("rejects fractional/overflow stock and preserves explicit zero physical counts", () => {
    const m = {
      id: "item",
      version: 0,
      kind: "RECONCILE",
      quantity: 0,
      date: "2026-10-01",
      reference: "ref",
      reason: "Count",
    };
    expect(movementInput.safeParse(m).success).toBe(true);
    expect(movementInput.safeParse({ ...m, quantity: 0.5 }).success).toBe(false);
    expect(movementInput.safeParse({ ...m, quantity: 2000000001 }).success).toBe(false);
  });
});
