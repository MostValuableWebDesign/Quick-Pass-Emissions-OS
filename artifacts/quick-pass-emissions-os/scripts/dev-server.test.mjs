import assert from "node:assert/strict";
import test from "node:test";
import { resolveDevPort } from "./dev-server.mjs";

const artifact = `
[[services]]
name = "other"
localPort = 8080
[[services]]
name = "web"
localPort = 24786
[services.development]
run = "pnpm run dev"
`;

test("honors the managed service's injected PORT", () => {
  assert.equal(resolveDevPort("5123", artifact), 5123);
});

test("falls back to the web service declaration, not Next's default", () => {
  assert.equal(resolveDevPort(undefined, artifact), 24786);
  assert.equal(resolveDevPort("", artifact), 24786);
});

test("fails explicitly for a missing service or invalid port", () => {
  assert.throws(() => resolveDevPort(undefined, ""));
  for (const invalid of ["invalid", "0", "65536", "-1", "3000.5"]) {
    assert.throws(() => resolveDevPort(invalid, artifact));
  }
});
