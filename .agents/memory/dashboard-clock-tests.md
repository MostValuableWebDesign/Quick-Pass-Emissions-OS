---
name: Dashboard clock test context
description: Constraints for the dashboard's live clock and server-rendered markup tests.
---

Dashboard markup tests use `renderToStaticMarkup`, which does not mount Next's App Router context. The live clock's rollover behavior uses `router.refresh()`, so mock `next/navigation` in those tests. Freeze system time as well to keep clock output stable across repeated renders.

**Why:** Without the router mock, `useRouter()` throws during static rendering; without a fixed clock, otherwise identical page renders legitimately differ.

**How to apply:** Keep the router mock and fixed-time setup in dashboard presentation tests when editing the clock or dashboard markup.
