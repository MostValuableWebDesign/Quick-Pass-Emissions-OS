---
name: Verification tooling
description: Temporary-tool scaffolding risks and inline TypeScript diagnostics that may silently do nothing.
---

A one-off Python package installation for PDF review can scaffold an unrelated root app and add system packages in this TypeScript workspace.

**Why:** The verification package installer generated root project scaffolding and system dependencies even though the app's PDF generator runs entirely in Node.

**How to apply:** Inspect package and configuration changes after installing temporary verification tools. Remove only newly generated, unused scaffolding and verification dependencies after review; preserve all existing app dependencies and files.

Inline `tsx -e` diagnostics may exit successfully without executing in this workspace; file-based `tsx` scripts execute correctly.

**Why:** Even a minimal console-output expression produced no output with the inline runner, while the same runtime executed script files normally.

**How to apply:** Use a temporary script file for operational diagnostics and require an explicit completion result rather than treating exit code zero alone as evidence that the diagnostic ran. Remove temporary diagnostics afterward.
