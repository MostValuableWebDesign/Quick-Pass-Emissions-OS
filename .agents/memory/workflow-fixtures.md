---
name: Private workflow fixture environments
description: Literal quotes in managed-workflow env files break datasource overrides without breaking direct fixture connectivity.
---

Temporary managed-workflow `env_file` overrides treat surrounding quotes as literal value characters, not shell quoting. Write raw `KEY=value` lines without outer quotes and check in-memory equality against the private registry before browser sign-in.

**Why:** An isolated fixture database migrated and accepted direct Prisma connections, but native browser sign-in reported unavailable because the running workflow received a quote-wrapped datasource URL. Inherited auth settings were present; changing authentication would have addressed the wrong problem.

**How to apply:** Only for disposable private-browser setup. Never print the registry, URL, credentials, cookies or tokens. Verify the exact running datasource privately, then restore the ordinary managed workflow and verify no process still uses the fixture before dropping it.
