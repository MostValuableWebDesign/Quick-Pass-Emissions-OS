import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  employees: vi.fn(),
  tasks: vi.fn(),
  actor: { id: "owner", role: "OWNER" },
}));

vi.mock("@/lib/access", () => ({ manager: async () => mocks.actor }));
vi.mock("@/lib/db", () => ({
  db: { employee: { findMany: mocks.employees }, taskInstance: { findMany: mocks.tasks } },
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("@/components/record-link", () => ({
  RecordLink: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("@/components/shared", () => ({
  PageHeader: ({ title }: { title: string }) => createElement("h1", null, title),
  TaskTable: () => createElement("div"),
  employeeSelect: {},
}));
vi.mock("@/components/action-form", () => ({
  ActionForm: ({
    submit,
    className,
    confirmOnSubmit,
    children,
  }: {
    submit: string;
    className?: string;
    confirmOnSubmit?: string;
    children?: ReactNode;
  }) =>
    createElement(
      "form",
      { className, "data-confirm": confirmOnSubmit },
      children,
      createElement("button", { type: "submit" }, submit),
    ),
}));
vi.mock("@/components/directory-add-dialog", () => ({
  DirectoryAddDialog: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/components/employee-fields", () => ({ EmployeeFields: () => null }));
vi.mock("@/app/actions", () => ({
  saveEmployee: vi.fn(),
  setEmployeeActive: vi.fn(),
}));

import Employees from "../src/app/(app)/employees/page";

function employee(id: string, userId: string, active: boolean, role = "EMPLOYEE") {
  return {
    id,
    userId,
    user: { id: userId, name: `Staff ${id}`, active, role },
    jobRole: "Inspector",
    phone: null,
    streetAddress: null,
    addressLine2: null,
    city: null,
    state: null,
    postalCode: null,
  };
}

async function render(status?: string) {
  return renderToStaticMarkup(await Employees({ searchParams: Promise.resolve({ status }) }));
}

beforeEach(() => {
  mocks.actor.id = "owner";
  mocks.actor.role = "OWNER";
  mocks.employees.mockResolvedValue([
    employee("active-staff", "staff-user", true),
    employee("inactive-staff", "former-user", false),
    employee("owner-staff", "owner", true, "OWNER"),
  ]);
  mocks.tasks.mockResolvedValue([]);
});

describe("employee directory removal controls", () => {
  it("offers remove and restore directly on eligible directory rows", async () => {
    const html = await render("all");
    expect(html).toContain("Remove from active staff");
    expect(html).toContain("Restore employee");
    expect(html).toContain('name="id" value="active-staff"');
    expect(html).toContain('name="active" value="false"');
    expect(html).toContain(
      'data-confirm="Remove Staff active-staff from active staff? Their employee record and payroll history will be kept, and they can be restored later."',
    );
    expect(html).toContain('name="id" value="inactive-staff"');
    expect(html).toContain('name="active" value="true"');
    expect(html).not.toContain('name="id" value="owner-staff"');
  });

  it("keeps inactive staff out of the active directory", async () => {
    const html = await render();
    expect(html).toContain("Remove from active staff");
    expect(html).not.toContain("Restore employee");
    expect(html).not.toContain("Staff inactive-staff");
  });
});
