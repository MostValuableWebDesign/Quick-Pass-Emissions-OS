import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ManagerOverviewSample,
  PaymentsDepositsSample,
  ResponsibilitiesSample,
  SamplePreviewControl,
  SuppliesSample,
} from "../src/components/manager-sample-preview";
import { WorkspaceTabs } from "../src/components/manager-workspace";

describe("Operations Manager sample preview", () => {
  it("shows sample values across overview, supplies, payments, deposits, and responsibilities", () => {
    const html = renderToStaticMarkup(
      createElement(
        "main",
        null,
        createElement(SamplePreviewControl, { active: true, path: "/operations" }),
        createElement(ManagerOverviewSample),
        createElement(SuppliesSample),
        createElement(PaymentsDepositsSample),
        createElement(ResponsibilitiesSample),
      ),
    );

    expect(html).toContain("Sample preview only");
    expect(html).toContain("2 rolls");
    expect(html).toContain("SAMPLE-CHK-104");
    expect(html).toContain("SAMPLE-PAY-042");
    expect(html).toContain("8 sample responsibilities");
    expect(html).toContain("Return to live data");
    expect(html).not.toContain("<form");
  });

  it("keeps sample mode across the Operations Manager workspace tabs", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceTabs, { active: "overview", sample: true }),
    );

    expect(html).toContain('href="/operations/supplies?sample=1"');
    expect(html).toContain('href="/operations/registers?sample=1"');
    expect(html).toContain('href="/tasks?sample=1"');
    expect(html).toContain('aria-current="page"');
  });

  it("offers the sample view without saving records", () => {
    const html = renderToStaticMarkup(
      createElement(SamplePreviewControl, { active: false, path: "/operations" }),
    );

    expect(html).toContain('href="/operations?sample=1"');
    expect(html).toContain("without adding business records");
  });
});
