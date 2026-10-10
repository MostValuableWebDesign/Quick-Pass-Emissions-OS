---
name: Private workflow fixture environments
description: Literal quotes in managed-workflow env files break datasource overrides without breaking direct fixture connectivity.
---

Temporary managed-workflow `env_file` overrides treat surrounding quotes as literal value characters, not shell quoting. Write raw `KEY=value` lines without outer quotes and check in-memory equality against the private registry before browser sign-in.

**Why:** An isolated fixture database migrated and accepted direct Prisma connections, but native browser sign-in reported unavailable because the running workflow received a quote-wrapped datasource URL. Inherited auth settings were present; changing authentication would have addressed the wrong problem.

**How to apply:** Only for disposable private-browser setup. Never print the registry, URL, credentials, cookies or tokens. Verify the exact running datasource privately, then restore the ordinary managed workflow and verify no process still uses the fixture before dropping it.

Managed artifact manifests with Git conflict markers are immediately unregistered, including their workflows. The schema replacement tool parses the existing manifest as well as its temporary replacement, so it cannot replace an invalid conflicted original.

**Why:** A normal shared-main merge temporarily removed the app from preview; validating a clean temporary manifest still failed on the original conflict markers.

**How to apply:** Resolve the manifest through Git's normal conflict mechanics by restoring a committed valid side, then validate the complete intended merged manifest with the artifact replacement tool. Keep its stable ID, port and both branches' required route prefixes. The valid restored manifest re-registers the managed workflow; restart that exact workflow, not a replacement.

Do not accept native-login success or a tester's summary as proof the browser suite completed. Require the exact suite-completion marker and process exit status; partial/empty screenshots are not persistence evidence.

**Why:** A browser tester incorrectly matched a generic success occurrence while the owned runner later reported assertion failures and removed its private database. Its screenshots showed only empty state.

**How to apply:** Inspect safe runner status independently before claiming passing counts. Keep failure diagnostics to named stages, local source positions and fixed classifications; never dump private exception/request/authentication objects.
