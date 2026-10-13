import { readFileSync } from "node:fs";
import { assertOwnedDatabase } from "./e2e-safety.mjs";
assertOwnedDatabase(process.env);
if (!process.env.E2E_PAYDAY_CLOCK_FILE) throw new Error("Owned payday clock file required");
const OriginalDate = Date;
const clock = () => {
  const instant = OriginalDate.parse(
    readFileSync(process.env.E2E_PAYDAY_CLOCK_FILE, "utf8").trim(),
  );
  if (!Number.isFinite(instant)) throw new Error("Invalid synthetic payday clock");
  return instant;
};
// Loaded only by the owned browser runner, never by application code or builds.
globalThis.Date = new Proxy(OriginalDate, {
  construct(target, args, newTarget) {
    return Reflect.construct(target, args.length ? args : [clock()], newTarget);
  },
  apply() {
    return new OriginalDate(clock()).toString();
  },
  get(target, prop, receiver) {
    return prop === "now" ? clock : Reflect.get(target, prop, receiver);
  },
});
