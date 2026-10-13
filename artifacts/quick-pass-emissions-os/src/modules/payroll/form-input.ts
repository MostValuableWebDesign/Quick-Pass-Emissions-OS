import { z } from "zod";
import { MAX_CENTS } from "./calculations";
/** Parse currency text exactly; blanks, booleans and excess decimal places are invalid. */
export const dollarsInput = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter dollars with at most two decimal places.")
  .transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    return Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
  })
  .pipe(z.number().int().min(0).max(MAX_CENTS));
