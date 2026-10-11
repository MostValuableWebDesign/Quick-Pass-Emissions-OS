import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("better-auth/react", () => ({ createAuthClient: () => ({ signOut: vi.fn() }) }));
vi.mock("@/app/actions", () => ({
  createManagerAccount: vi.fn(),
  issueManagerAccountInvite: vi.fn(),
  setManagerAccountActive: vi.fn(),
}));

import { Shell } from "@/components/shell";
import { ManagementAccounts } from "@/components/management-accounts";

describe("account navigation and controls", () => {
  it("shows only a clickable account icon instead of name, role, timezone and theme controls", () => {
    const props = { role: "OWNER", children: "Dashboard" };
    const html = renderToStaticMarkup(createElement(Shell, props));
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).toContain('href="/settings/account"');
    expect(header).toContain('aria-label="Open account settings"');
    expect(header).not.toContain("Eastern time");
    expect(header).not.toContain("Toggle theme");
    expect(header).not.toContain("user-label");
  });

  it("keeps the Settings heading non-clickable and groups settings pages by purpose", () => {
    const props = { role: "OWNER", children: "Dashboard" };
    const html = renderToStaticMarkup(createElement(Shell, props));
    const settingsSection = html.indexOf('data-nav-section="settings"');
    const businessSettingsLink = html.indexOf('href="/settings"');
    expect(settingsSection).toBeGreaterThan(-1);
    expect(businessSettingsLink).toBeGreaterThan(-1);
    expect(businessSettingsLink).toBeLessThan(settingsSection);
    expect(html).toContain('id="nav-settings">SETTINGS</p>');
    expect(html).toContain("BUSINESS SETUP");
    expect(html).toContain("Business operations");
    expect(html).toContain("Reminders &amp; notifications");
    expect(html).toContain("Account &amp; security");
  });

  it("keeps add user collapsed behind a button and protects the current owner's account", () => {
    const html = renderToStaticMarkup(createElement(ManagementAccounts, {
      currentUserId: "owner",
      accounts: [{ user: {
        id: "owner", name: "Example Owner", email: "owner@example.test", phone: "",
        role: "OWNER", active: true, employee: null, accounts: [{ id: "credential" }],
      } }],
    }));
    expect(html).toContain("<details");
    expect(html).toContain("Add user");
    expect(html).not.toContain("<details open");
    expect(html).toContain("Protected");
    expect(html).not.toContain(">Deactivate<");
    expect(html).toContain('name="role"');
    expect(html).toContain("Manager — business access");
    expect(html).toContain("Owner — full owner privileges");
  });
});
