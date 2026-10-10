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

**Why:** Native CLI pushes rejected the credential despite a healthy source-control connection status and again after the user reconnected to a new native connection. The independent GitHub App could read and write the same repository. Source-control connect/reconnect cards rejected native connection IDs.

**How to apply:** Verify actual Git access rather than trusting connection status. For native reauthorization use account settings → Git Providers, following official documentation. Do not repeat reconnect loops after a confirmed reconnect still fails. An authorized GitHub App is an independent write path, not a repair of native Git authentication; verify its repository permission separately and never extract credentials.
