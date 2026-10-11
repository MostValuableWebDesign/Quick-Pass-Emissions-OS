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

Prefer a separately bound disposable server for ordinary protected-page checks rather than temporarily replacing the live preview's database.

**Why:** The user reported losing their Quick Pass session while checking Replit working-session progress. Switching the preview to a fixture database would necessarily change which sessions it recognizes, though this does not establish the cause of the reported logouts.

**How to apply:** Keep the managed preview and its real authentication configuration intact during role/navigation checks. Target the private server explicitly with private session states; use the managed preview only when actual proxy behavior needs verification.

Navigation visibility is not a server authorization contract, and a streamed Next response can retain HTTP 200 after access is denied.

**Why:** Protected-page checks misclassified existing permission-error rendering and a legacy empty view as authorization failures by assuming every omitted menu destination must return a 4xx response.

**How to apply:** Inspect the existing route's data scope before asserting denial. Check its explicit permission/redirect signal or absence of protected records, rather than changing permissions to satisfy a status-only test.

Do not assume stopping a background verification shell runs its asynchronous cleanup.

**Why:** Terminating a manual fixture runner bypassed its cleanup and left owned temporary resources behind.

**How to apply:** Prefer graceful runner shutdown and verify cleanup. If interrupted, confirm exact ownership before removing disposable resources; never use broad database or cache cleanup against the live preview.

Private browser suites must provision the temporary login mapping their selected specs use, and update the runner's expected-report count and success label together.

**Why:** A focused suite that used the shared login helper reached the sign-in step without its temporary credential mapping, because that file had only been generated when the operations suite ran. A smaller suite can also complete its assertions but be rejected by the default full-suite count gate. The generic private-error wrapper intentionally hides the underlying report exception.

**How to apply:** Always create the short-lived, private owner credential mapping when any selected spec calls the shared login helper; then verify the selector/count contract. Record browser assertions, wrapper completion and any lost private report evidence separately; never infer a fully green run from screenshots alone.

Keep privileged application-service fixture preparation in the native runner, not inside the browser driver's transformed test modules.

**Why:** A continuation fixture failed before assertions when the driver imported server services, with an error location that did not identify the failing test selector. Native preparation completed successfully and allowed the remaining checks to pass; the earlier failure alone was not proof of an application defect.

**How to apply:** Prepare only runner-owned synthetic data using the existing datasource/actor guards, then pass private metadata to the driver. Keep module/fixture failures separate from UI failures in completion reports.

Direct fixture-server networking and the browser executable are independent choices.

**Why:** Selecting a loopback fixture server incorrectly bypassed the workspace's system Chromium. Playwright's downloaded Chromium was absent, so authentication setup passed but browser execution failed at the test declaration before any UI assertion.

**How to apply:** Check the available browser executable even for direct isolated runs. A failure reported only at the test declaration may be a browser setup failure, not an application regression.
