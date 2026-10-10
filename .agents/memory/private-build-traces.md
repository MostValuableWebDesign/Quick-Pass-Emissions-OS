---
name: Private inputs and Next server tracing
description: Private import evidence needs a separate build-tracing privacy boundary.
---

Do not assume Git or deployment ignore files also control Next server dependency traces.
Dynamically resolved filesystem paths in backup utilities can trigger whole-project
tracing warnings, including in a monorepo.

**Why:** Import backup integration produced this warning even though private sources,
manifests and archives were ignored by Git and deployment packaging. A warning is a
risk signal, not proof that private files were included.

**How to apply:** Keep private inputs out of public/build directories, explicitly exclude
private workspace folders from server traces, and inspect emitted trace paths before
publication. Check paths/counts without printing source contents, credentials or backups.
