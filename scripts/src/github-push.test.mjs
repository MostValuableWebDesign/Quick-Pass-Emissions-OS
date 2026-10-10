import test from "node:test";
import assert from "node:assert/strict";
import { commitPayload, isUtf8 } from "./github-push.mjs";
const raw =
  "tree 0123456789012345678901234567890123456789\nauthor Fixture <fixture@example.invalid> 1700000000 +0000\ncommitter Fixture <fixture@example.invalid> 1700000000 +0000\n\nSubject\n\nBody\n";
test("keeps message paragraphs and exact UTC commit identity", () => {
  const payload = commitPayload(raw);
  assert.equal(payload.message, "Subject\n\nBody");
  assert.deepEqual(payload.parents, []);
  assert.equal(payload.author.date, "2023-11-14T22:13:20.000Z");
});
test("preserves merge parent order", () => {
  const parents =
    "parent aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nparent bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n";
  assert.deepEqual(
    commitPayload(raw.replace("author Fixture", parents + "author Fixture"))
      .parents,
    ["a".repeat(40), "b".repeat(40)],
  );
});
test("refuses unsupported metadata instead of rewriting history", () => {
  assert.throws(
    () =>
      commitPayload(
        raw.replace("author Fixture", "encoding UTF-8\nauthor Fixture"),
      ),
    /Custom or signed/,
  );
  assert.throws(() => commitPayload(raw.replaceAll("+0000", "-0400")), /UTC/);
});
test("uses inline content only when UTF-8 round-trips byte-for-byte", () => {
  assert.equal(isUtf8(Buffer.from("Text · 漢字\n")), true);
  assert.equal(isUtf8(Buffer.from([0, 255, 2])), false);
  assert.equal(isUtf8(Buffer.from([255, 254])), false);
});
