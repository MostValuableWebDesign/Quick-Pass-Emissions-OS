import { describe, expect, it } from "vitest";
import { dollarsInput } from "../src/modules/payroll/form-input";
describe("Payroll dollar entry", () => {
  it.each([
    ["0", 0],
    ["0.00", 0],
    ["125.50", 12550],
    ["1.01", 101],
    ["20000000.00", 2000000000],
    [" 2.5 ", 250],
  ])("parses %s as exact cents", (input, cents) => expect(dollarsInput.parse(input)).toBe(cents));
  it.each(["", " ", null, false, true, "1.001", "1e2", "-1", "20000000.01"])(
    "rejects invalid or absent amount %j",
    (input) => expect(dollarsInput.safeParse(input).success).toBe(false),
  );
});
