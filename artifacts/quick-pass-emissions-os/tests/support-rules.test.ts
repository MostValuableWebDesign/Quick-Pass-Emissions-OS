import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  phoneLink,
  emailLink,
  externalLink,
  sourceDirectory,
  historyInput,
  ticketProviderInput,
} from "../src/modules/support/rules";
describe("support contact rules", () => {
  it("formats valid phones without pretending to dial extensions", () => {
    expect(phoneLink("(800) 555-0123")).toBe("tel:8005550123");
    expect(phoneLink("+44 20 7946 0123")).toBe("tel:+442079460123");
    for (const input of ["", "555", "555-0123 ext 4", "javascript:alert(1)", "8005550123;123"])
      expect(phoneLink(input)).toBeNull();
  });
  it("renders only genuine email and safe external destinations", () => {
    expect(emailLink("service@example.test")).toBe("mailto:service@example.test");
    expect(emailLink("")).toBeNull();
    expect(emailLink("bad\r\ncc:evil")).toBeNull();
    expect(externalLink("https://example.test/support")).toBe("https://example.test/support");
    for (const url of [
      "javascript:alert(1)",
      "https://user:secret@example.test",
      "/fake",
      "mailto:a@b.com",
    ])
      expect(externalLink(url)).toBeNull();
  });
  it("supports distinct categories and excludes invented import confirmation/assignments", () => {
    expect(CATEGORIES).toHaveLength(6);
    expect(
      sourceDirectory.parse({ categories: [CATEGORIES[0], CATEGORIES[2]] }).categories,
    ).toHaveLength(2);
    expect(sourceDirectory.safeParse({ lastConfirmedDate: "2026-01-01" }).success).toBe(false);
    expect(sourceDirectory.safeParse({ equipmentId: "invented" }).success).toBe(false);
    expect(sourceDirectory.safeParse({ categories: [CATEGORIES[0], CATEGORIES[0]] }).success).toBe(
      false,
    );
  });
  it("rejects injected actor/repair management fields in narrow mutations", () => {
    expect(
      ticketProviderInput.safeParse({
        id: "ticket",
        version: 0,
        vendorId: "",
        reason: "test",
        repairCostCents: 0,
      }).success,
    ).toBe(false);
    expect(
      historyInput.safeParse({
        vendorId: "vendor",
        contactedAt: "2026-01-01T00:00:00Z",
        method: "PHONE",
        outcome: "",
        reference: "",
        followUpDate: null,
        actorId: "other",
      }).success,
    ).toBe(false);
  });
});
