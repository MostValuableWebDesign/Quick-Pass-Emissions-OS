import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PerformanceDayFilter } from "../src/components/performance-day-filter";

describe("one-date station count filter", () => {
  it("submits one explicit daily date without requiring a range radio or client navigation", () => {
    const html = renderToStaticMarkup(
      React.createElement(PerformanceDayFilter, { date: "2026-01-15", today: "2026-01-16" }),
    );
    expect(html).toContain('action="/performance"');
    expect(html).toContain('method="get"');
    expect(html).toContain('name="preset" value="day"');
    expect(html).toContain('name="date"');
    expect(html).toContain('value="2026-01-15"');
    expect(html).toContain('max="2026-01-16"');
    expect(html).toContain("Show daily count");
    expect(html).not.toContain('name="employeeId"');
  });

  it("preserves the chosen employee when requesting another day's count", () => {
    const html = renderToStaticMarkup(
      React.createElement(PerformanceDayFilter, {
        date: "2026-01-15",
        today: "2026-01-16",
        employeeId: "fixture-employee",
      }),
    );
    expect(html).toContain('name="employeeId" value="fixture-employee"');
  });
});
