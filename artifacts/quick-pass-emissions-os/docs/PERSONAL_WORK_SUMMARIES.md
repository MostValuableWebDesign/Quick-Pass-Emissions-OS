# Reviewed work summaries

In Notes & Tasks, a note's **Polish into work summary** action sends only that
selected saved note (title, text and checklist) and the person's clarification
answers to the configured Replit AI Integrations OpenAI provider. It is an
on-demand action, not a background job. AI usage is billed to Replit credits;
editing or saving approved wording does not make another AI request.

## Review and accuracy

- Originals are never rewritten by the action.
- Ambiguous actions/outcomes trigger one short clarification question at a time.
  Unknown optional details should be omitted rather than invented.
- Suggestions are checked for newly introduced numbers and reviewed by a second
  model call for factual support before being shown as ready.
- Suggestions remain unsaved until **Save work summary**. The person can edit
  them first. AI is assistance, not evidence; the person reviews factual accuracy.
- Saving preserves a source-text snapshot, confirmed answers and approved text.
- The service rejects an old source version rather than applying a suggestion
  to a note changed in another tab. Existing saved wording remains available
  when the raw note changes, with a prompt to polish again.
- Provider errors return a generic failure; no note text, credentials or
  provider response bodies are logged. Diagnostic logs contain only an error
  class and optional HTTP status.

## Tasks and summaries

Saved wording fills the description of the task converted from the **whole
note**, and its completion record when already completed. Checklist-item tasks
are deliberately excluded because a whole-note summary can claim more work
than an individual item describes.

Polishing and saving never create a task or mark work completed automatically.
When the person later completes the linked task, the saved wording supplies an
empty completion note. Existing completion dates and status remain unchanged
when wording is updated.

Newly generated/regenerated biweekly summaries use the saved wording for
recorded completions, including later reviewed annotations of earlier work.
Existing saved summary snapshots are not silently rewritten. No new schedule
is provisioned or enabled by this feature.

## Verification

Run `personal-polish.test.ts`, `personal-polish-api.test.ts`, existing personal
rules/API tests, typechecking and scoped lint.

For live synthetic verification, prepare the owned fixture accounts with
`scripts/personal-workspace-verify.ts`, then run
`scripts/personal-polish-verify.ts`. This invokes the real AI provider on
synthetic text only and checks persistence, account isolation, stale versions,
unchanged originals, task completion wording and summary output. Clean up
with `scripts/personal-workspace-verify.ts cleanup` after any browser checks.
