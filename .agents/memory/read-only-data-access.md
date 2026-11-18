---
name: Read-only data access
description: Keep navigation responsive without weakening permissions or mutation serialization.
---

Keep page reads independent of business-wide write locks. Consistent read-only
snapshots are preferable to serializing navigation behind payroll, source
imports, invoices and operational changes.

**Why:** The owner reported slow navigation across the app and explicitly asked
to remove unnecessary read locks while preserving permission checks. Shared
alerts and per-item lookups made unrelated pages contend with business writers.

**How to apply:** Recheck active status and the original allowed roles within
each read transaction; do not cache account permissions across requests. Preserve
the writer locks, optimistic versions and financial controls on mutations.
An export that records an audit event is not a pure read. Avoid automatic
global replacement of transaction helpers: verify each callback is read-only
and keep station/owner scope intact.
