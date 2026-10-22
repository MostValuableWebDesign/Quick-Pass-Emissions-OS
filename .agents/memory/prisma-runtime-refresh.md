---
name: Prisma runtime refresh
description: Distinguishing missing database tables from stale Prisma model delegates in a running Next development server.
---

After adding Prisma models, applying a database migration alone does not update a Prisma client already loaded by the development server. Regenerate the client and restart the managed web workflow.

**Why:** Chemical tables existed in the database while the running transaction client exposed no chemical-sensor delegate. A newly generated client successfully executed the same count queries. Database readiness and application-preview readiness were separate checks.

**How to apply:** For an undefined Prisma model delegate, check the generated client's model support separately from table existence. Do not remove valid schema filters or reset business data to accommodate a stale client. Confirm the managed app responds through Preview before claiming the user-facing page is repaired.
