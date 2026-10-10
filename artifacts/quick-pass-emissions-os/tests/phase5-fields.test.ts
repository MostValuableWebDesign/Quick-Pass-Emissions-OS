import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Field } from "../src/components/action-form";
import { Phase5Field } from "../src/components/phase5-field";
import { InventoryTable } from "../src/components/phase5";

describe("Phase 5 native form labels", () => {
  it.each([Phase5Field, Field])(
    "associates repeated labels with their own control without generated hydration IDs: %s",
    (Component) => {
      const render = () =>
        renderToStaticMarkup(
          createElement(
            "form",
            null,
            ...["first", "second"].map((name) =>
              createElement(
                Component,
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
    },
  );
  it("does not present technical fallback windows/averages/leads as configured business forecasts", () => {
    const html = renderToStaticMarkup(
      createElement(InventoryTable, {
        inventory: [
          {
            key: "fixture",
            name: "Fixture chemical",
            unit: "ML",
            state: "UNCONFIGURED",
            balance: 50,
            threshold: 0,
            low: false,
            coverageDays: 7,
            recordedConsumption: 0,
            observationStart: "2026-10-04",
            observationEnd: "2026-10-10",
            averageDailyUsage: 0,
            planningLeadDays: 0,
            configured: false,
          },
        ],
      }),
    ).replaceAll(/<!--.*?-->/g, "");
    expect(html).toContain("Observation policy not configured");
    expect(html).not.toContain("Window 2026-10-04");
    expect(html).not.toContain("0.00");
    expect(html).toContain("Planning lead: unconfigured");
  });
});
