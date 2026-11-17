import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DealerVirRecoveryNotice } from "@/components/dealer-vir-recovery-notice";

describe("duplicate VIR invoice recovery", () => {
  it("links to saved services instead of importing duplicate inspections", () => {
    const html = renderToStaticMarkup(
      createElement(DealerVirRecoveryNotice, { dealershipId: "fixture-dealership" }),
    );
    expect(html).toContain('href="/dealerships/fixture-dealership#create-invoice"');
    expect(html).toContain("Invoice saved services");
    expect(html).toContain("You do not need to upload the PDFs again.");
    expect(html).toContain("Services attached to another invoice cannot be billed again.");
  });
});
