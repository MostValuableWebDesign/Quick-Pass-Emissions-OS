---
name: Cold preview startup
description: Imported Next preview startup behavior after a workspace restart
---

Keep the imported Next app on Webpack for development unless a replacement bundler is verified after a cold workspace restart, not only through hot reload.

**Why:** After a workspace restart, Turbopack repeatedly logged “Ready” while the managed preview failed its HTTP startup check. The existing datastore identity remained intact. Using Webpack restored both direct and proxied health responses and the sign-in page.

**How to apply:** Treat a framework-ready log as insufficient evidence. Verify an HTTP response through both the local service and the public preview proxy. Preserve datastore identity checks; do not reset or replace a database to resolve a preview startup failure.
