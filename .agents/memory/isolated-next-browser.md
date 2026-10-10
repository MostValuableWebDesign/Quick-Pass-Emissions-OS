---
name: Isolated Next browser checks
description: Non-obvious generated-state and credential privacy constraints for temporary browser verification.
---

An alternate Next development build directory is not a complete generated-state isolation boundary. Next can still rewrite the app's shared TypeScript include paths and generated type imports.

**Why:** Running an isolated browser server with its own build cache left shared type files referring to that cache after the cache was deleted.

**How to apply:** Preserve the original generated-file state before temporary server startup and remove only the run-owned path changes during cleanup. Preserve concurrent semantic edits rather than blindly restoring whole source files.

Keep credential authentication outside the instrumented browser and transfer only private temporary session state into browser checks.

**Why:** Automatic browser layout snapshots previously exposed a generated fixture password even though it was only test data.

**How to apply:** Never type fixture credentials into captured browser forms or print authentication exceptions, cookies, hashes, or tokens. Validate the native credential POST in-process; use owned isolated data for signed-in browser navigation and mutations.
