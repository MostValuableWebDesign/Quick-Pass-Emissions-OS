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

Published GitHub commits must remain ancestors even when project completion synchronizes the task onto a newer workspace main.

**Why:** Completion synchronization rebased already-published task commits. Overwriting GitHub afterward would lose published ancestry or require an unauthorized force-push.

**How to apply:** Finish project conflict resolution and the completion callback before the final normal merge of already-published GitHub ancestry. Merging that ancestry back before retrying completion can repeatedly replay older published commits and recreate the same conflicts. Preserve the newer workspace's private verification infrastructure and the task's upgrade checks together. Inspect actual code/test scopes, not just conflict markers: automatic reconciliation can corrupt repeated test blocks without leaving markers. Run cheap checks for changed source and compare the final remote hash; a tree-identical ancestry merge does not invalidate earlier tests.

Completion synchronization can create a non-UTC ancestor that the exact-commit GitHub App bridge cannot upload, even after a feature was successfully published.

**Why:** The app connector remained authorized, but a newly recreated ancestor no longer fit the bridge's unsigned-UTC transport restriction while native Git authentication was still broken.

**How to apply:** Preserve published ancestry normally and use a working native transport when available. Otherwise declare the exact publication blocker and distinguish the previously published implementation from subsequent local fixes; never call an older successful push full synchronization of the final source.
## Paused merge state

Re-check both `HEAD` and `MERGE_HEAD` before finalizing manually resolved conflicts. A checkpoint alone is not proof that incoming changes were merged.

**Why:** A workspace reset during a paused merge cleared the incoming staged changes and merge state, then left an empty checkpoint. The conflict-free working tree still lacked the incoming feature.

**How to apply:** Confirm the intended merge state immediately before staging and committing. Verify that the resulting commit has both parents and includes the incoming tip before running long checks or pushing. If the merge state vanished, compare the current tree and retry a normal merge; never infer success from the absence of conflict markers.
