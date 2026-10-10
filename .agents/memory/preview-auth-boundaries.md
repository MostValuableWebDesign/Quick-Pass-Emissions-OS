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

The development preview can forward an internal upstream Origin. Trust only the exact observed internal origin, only in Replit development; keep production origin and CSRF validation unchanged.

**Why:** A secure, stateless HTTP login check succeeded, but the user's browser still failed because its cookies caused origin validation to run against the forwarded internal address.

**How to apply:** Include a harmless cookie in browser-origin regression checks, verify unrelated origins remain rejected, and test that development-only trust is absent in production. Never solve this by disabling CSRF checks or accepting arbitrary request origins.

Next.js Server Actions enforce their own Origin versus forwarded-host check independently of Better Auth.

**Why:** After authentication and protected page GETs worked, a native vendor form still failed because the forwarded public host did not match the internal preview Origin.

**How to apply:** Keep the exact development-only Server Action host allowance aligned with the authentication origin allowance. Verify one native protected form POST, not just login and page GETs; production must not inherit internal development hosts.
