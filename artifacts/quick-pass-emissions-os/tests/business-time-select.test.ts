import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BusinessTimeSelect } from "../src/components/business-time-select";

describe("business time dropdown values", () => {
  it.each(["00:00", "12:00", "17:45", "23:59"])(
    "preserves %s exactly in the saved field",
    (value) => {
      const markup = renderToStaticMarkup(
        createElement(BusinessTimeSelect, {
          name: "openTime1",
          label: "Monday opening time",
          value,
        }),
      );
      expect(markup).toContain(`name="openTime1" value="${value}"`);
      expect(markup).toContain('aria-label="Monday opening time hour"');
      expect(markup).toContain('aria-label="Monday opening time minute"');
      expect(markup).toContain('aria-label="Monday opening time AM or PM"');
    },
  );
  it("does not invent hours when no time has been saved", () => {
    const markup = renderToStaticMarkup(
      createElement(BusinessTimeSelect, { name: "closeTime7", label: "Sunday closing time" }),
    );
    expect(markup).toContain('name="closeTime7" value=""');
  });
});
