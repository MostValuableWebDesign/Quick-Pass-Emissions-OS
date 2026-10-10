import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Phase5Field } from "../src/components/phase5-field";

describe("Phase 5 native form labels", () => {
  it("associates repeated labels with their own control without generated hydration IDs", () => {
    const render = () =>
      renderToStaticMarkup(
        createElement(
          "form",
          null,
          ...["first", "second"].map((name) =>
            createElement(
              Phase5Field,
              {
                label: "Observation days",
                key: name,
              },
              createElement("input", { name, type: "number" }),
            ),
          ),
        ),
      );
    const html = render();
    expect(html).toBe(render());
    expect(html).toContain(
      '<label><span>Observation days</span><input type="number" name="first"/></label>',
    );
    expect(html).toContain(
      '<label><span>Observation days</span><input type="number" name="second"/></label>',
    );
    expect(html).not.toMatch(/\sid=|for=/);
  });
});
