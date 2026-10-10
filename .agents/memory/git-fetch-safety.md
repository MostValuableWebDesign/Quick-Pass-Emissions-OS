---
name: Git fetch safety gate
description: An environment-specific difference between outer shell permission and subprocess environment overrides.
---

For an approved metadata-only Git fetch, the workspace Git safety override must be present on the outer tool command.

**Why:** Setting the override only in a Node subprocess environment still caused the tool boundary to block the FETCH_HEAD write before the script could complete.

**How to apply:** Use an explicit outer `DANGEROUSLY_ALLOW_GIT=1` prefix for the approved fetch/update-preview command. This is not permission to reset, force-merge unrelated histories, rebase, commit, push, or discard work. Keep mapped imports pinned to the reviewed revision and preserve the workspace's local compatibility fixes.
