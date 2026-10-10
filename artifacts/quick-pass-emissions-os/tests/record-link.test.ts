import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NavRoleContext, RecordLink } from "../src/components/record-link";

vi.mock("next/navigation", () => ({
  usePathname: () => "/payroll/p1",
  useSearchParams: () => new URLSearchParams("year=2026"),
}));
vi.mock("next/link", async () => {
  const { createElement: element } = await import("react");
  return {
    default: (props: React.ComponentProps<"a">) => element("a", props),
  };
});

function render(role: string, href: string) {
  return renderToStaticMarkup(
    createElement(
      NavRoleContext.Provider,
      { value: role },
      createElement(
        RecordLink,
        { href, className: "text-link" } as React.ComponentProps<typeof RecordLink>,
        "Visible record label",
      ),
    ),
  );
}

describe("record links respect module access without hiding permitted data", () => {
  it("keeps staff profiles navigable for owners and managers with return context", () => {
    for (const role of ["OWNER", "ADMIN"]) {
      const html = render(role, "/employees/employee_1");
      expect(html).toContain("<a");
      expect(html).toContain("from=");
      expect(html).toContain("Visible record label");
    }
  });
  it("keeps payroll staff names visible but removes inaccessible bookkeeper profile links", () => {
    const html = render("BOOKKEEPER", "/employees/employee_1");
    expect(html).toContain("Visible record label");
    expect(html).toContain("<span");
    expect(html).not.toContain("href=");
  });
  it("does not send employees from a maintenance record to the manager-only bay board", () => {
    const html = render("EMPLOYEE", "/carwash");
    expect(html).toContain("Visible record label");
    expect(html).not.toContain("href=");
    expect(render("EMPLOYEE", "/tasks/task_1")).not.toContain("<a");
  });
});
