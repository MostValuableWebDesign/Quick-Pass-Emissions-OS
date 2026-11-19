import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DealerVirRecoveryNotice } from "@/components/dealer-vir-recovery-notice";

describe("duplicate VIR invoice recovery", () => {
  it("explains VIN updates and safe reuse without blocking reuploads", () => {
    const html = renderToStaticMarkup(
      createElement(DealerVirRecoveryNotice, { dealershipId: "fixture-dealership" }),
    );
    expect(html).toContain(
      'href="/dealerships/fixture-dealership?section=services#create-invoice"',
    );
    expect(html).toContain("Open saved services");
    expect(html).toContain("Reuse saved service");
    expect(html).toContain("Services attached to a sent invoice cannot be billed again.");
    expect(html).not.toContain("You do not need to upload");
  });
});
