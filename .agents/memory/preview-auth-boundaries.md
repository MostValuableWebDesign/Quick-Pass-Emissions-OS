---
name: Preview authentication boundaries
description: Routing and credential-submission lessons from importing the Next.js app into the artifact workspace.
---

Imported Next.js endpoints need explicit artifact service prefixes when the workspace also has a shared API scaffold.

**Why:** The root web preview rendered correctly while authentication POST requests were routed to the inactive shared API service and returned 502. A successful login-page screenshot did not verify authentication routing.

**How to apply:** Check longest-prefix ownership of the app's API paths and explicitly register its Next.js API and HMR paths through the validated artifact workflow. Confirm requests through the public proxy, not only directly on the service port.

Credential forms must submit POST safely before or without client hydration; a client-only preventDefault handler is not an adequate safeguard.

**Why:** A real sign-in attempt fell back to native GET and placed credentials in the URL and request logs. Never reuse or quote credentials exposed this way.

**How to apply:** Keep credential submission server-handled, verify a dummy submission in a browser, and rotate any exposed credential through the documented recovery flow. Do not read or replay sensitive historical logs. Verify successful authentication, not merely the public screen.
