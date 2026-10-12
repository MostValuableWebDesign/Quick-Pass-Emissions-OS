import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmployeeFields } from "@/components/employee-fields";
import { DealershipFields } from "@/components/dealership-fields";
import { contactEmployeeInput, formatContactAddress } from "@/lib/contact-address";

describe("contact-focused forms", () => {
  it("renders dealership phone/email semantics, structured address fields and comments", () => {
    const html = renderToStaticMarkup(createElement(DealershipFields));
    expect(html).toMatch(/<input(?=[^>]*name="phone")(?=[^>]*type="tel")[^>]*>/);
    expect(html).toMatch(/<input(?=[^>]*name="email")(?=[^>]*type="email")[^>]*>/);
    for (const key of ["streetAddress", "addressLine2", "city", "state", "postalCode"])
      expect(html).toContain(`name="${key}"`);
    expect(html).toContain("Billing address");
    expect(html).toContain("Additonal comments");
    expect(html).not.toContain("Private account notes");
  });

  it("renders employee contacts and job role without removed access or administration fields", () => {
    const html = renderToStaticMarkup(createElement(EmployeeFields));
    for (const key of ["name", "phone", "jobRole", "streetAddress", "city", "state", "postalCode"])
      expect(html).toContain(`name="${key}"`);
    expect(html).toMatch(/<input(?=[^>]*name="phone")(?=[^>]*type="tel")[^>]*>/);
    for (const key of ["email", "role", "startDate", "duties", "workAreas", "managerNotes"])
      expect(html).not.toContain(`name="${key}"`);
  });

  it("accepts a staff contact without email and strips submitted account permissions", () => {
    const contact = contactEmployeeInput.parse({
      name: "Example Inspector", phone: "(404) 555-0123", jobRole: "Inspector",
      role: "OWNER", email: "example@example.test",
    });
    expect(contact.jobRole).toBe("Inspector");
    expect(contact).not.toHaveProperty("role");
    expect(contact).not.toHaveProperty("email");
    expect(contact).not.toHaveProperty("duties");
  });

  it("rejects malformed certification dates and formats billing addresses for invoices", () => {
    expect(contactEmployeeInput.safeParse({
      name: "Example Inspector", phone: "", jobRole: "Inspector",
      certificationExpires: "2026-02-30",
    }).success).toBe(false);
    expect(formatContactAddress({
      streetAddress: "123 Example Road", addressLine2: "Suite 2",
      city: "Atlanta", state: "GA", postalCode: "30301",
    })).toBe("123 Example Road\nSuite 2\nAtlanta, GA 30301");
  });
});
