---
name: Git safety and synchronization
description: Outer Git permission requirements and the user's shared-main synchronization policy.
---

For an approved metadata-only Git fetch, the workspace Git safety override must be present on the outer tool command.

**Why:** Setting the override only in a Node subprocess environment still caused the tool boundary to block the FETCH_HEAD write before the script could complete.

**How to apply:** Use an explicit outer `DANGEROUSLY_ALLOW_GIT=1` prefix for the approved fetch/update-preview command. This is not permission to reset, force-merge unrelated histories, rebase, commit, push, or discard work. Keep mapped imports pinned to the reviewed revision and preserve the workspace's local compatibility fixes.

## Shared-main synchronization policy

The user chose to synchronize the complete Replit workspace on GitHub `main`, accepting the change from a standalone app to the workspace layout. Preserve both histories without force-pushing.

**Why:** The user wants all changes genuinely synchronized and expects the Git pull/push indicators to reflect that; importing matching app files is not sufficient.

**How to apply:** Use shared commit history and normal Git synchronization once the layout transition is complete. Do not describe a mapped file import as full Git synchronization or discard local work merely to clear the indicators.

## Native Git provider authorization

The native Git-provider connection is separate from an application GitHub connector.

**Why:** Native CLI pushes rejected the stored credential despite a healthy source-control connection status. Both reconnect and connect cards rejected the source-control connection ID, whereas its inspection explicitly said CLI authentication is managed automatically.

**How to apply:** Verify actual Git access with a non-mutating push dry run. If the native provider needs reauthorization and the cards cannot open it, use Replit account settings → Git Providers, following official documentation. Do not attach an unrelated app connector or expose credentials to work around native Git authentication.
