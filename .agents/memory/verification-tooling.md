---
name: Verification tooling
description: Avoid retaining unrelated runtime scaffolding from one-off PDF review tooling.
---

A one-off Python package installation for PDF review can scaffold an unrelated root app and add system packages in this TypeScript workspace.

**Why:** The verification package installer generated root project scaffolding and system dependencies even though the app's PDF generator runs entirely in Node.

**How to apply:** Inspect package and configuration changes after installing temporary verification tools. Remove only newly generated, unused scaffolding and verification dependencies after review; preserve all existing app dependencies and files.
