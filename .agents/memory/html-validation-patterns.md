---
name: HTML validation patterns
description: Browser behavior for `pattern` constraints on contact-form inputs.
---

When authoring an HTML `pattern`, escape punctuation used literally inside character classes, especially `(`, `)`, `.`, and `-`. Current browsers compile patterns with Unicode-set semantics; a syntactically invalid pattern may be ignored, leaving `checkValidity()` true for malformed input.

**Why:** Browser-based phone validation initially appeared wired up but did not reject invalid characters because the character class was invalid under the browser's pattern grammar. Server validation still worked, but the expected immediate form feedback did not.

**How to apply:** Test `HTMLInputElement.checkValidity()` with both valid and invalid examples in the real browser, and rely on server-side validation as the final safeguard.
