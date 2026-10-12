"use client";
import { useRef, useState, useTransition } from "react";
import { syncGoogleAction, advanceGoogleSyncAction } from "@/app/analytics-actions";
import { useRouter } from "next/navigation";
export function GoogleSync({
  locationId,
  start,
  end,
  previousStart,
  previousEnd,
  request,
}: {
  locationId: string;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
  request: { id: string; status: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, transition] = useTransition();
  const [message, setMessage] = useState("");
  const executing = useRef(false);
  const pending = request && ["QUEUED", "RUNNING"].includes(request.status);
  async function submit() {
    if (executing.current) return;
    executing.current = true;
    setBusy(true);
    setMessage("Queued — requesting Google sync…");
    try {
      let id = pending ? request.id : undefined;
      if (!id) {
        const result = await syncGoogleAction({ locationId, start, end });
        if (!result.id) {
          setMessage(result.error ?? "Unable to request sync.");
          return;
        }
        id = result.id;
      }
      // This loop belongs to the explicit submit interaction. Mounts, page visits,
      // filter changes and status rendering never enqueue or execute provider work.
      // Each authenticated step advances one durable page; the jobs worker recovers
      // remaining work if this interaction is interrupted or the page is closed.
      while (true) {
        setMessage("Running — fetching the requested Google data…");
        const status = await advanceGoogleSyncAction(id);
        if (!status.ok) {
          setMessage(status.error);
          transition(() => router.refresh());
          break;
        }
        const label =
          status.status === "SUCCESS"
            ? "Completed"
            : status.status === "PARTIAL"
              ? "Partial — some sources failed"
              : status.status === "FAILED"
                ? "Failed"
                : status.status === "QUEUED"
                  ? "Queued"
                  : "Running";
        setMessage(
          `${label} · ${status.successful}/${status.total} sources completed.${status.errors.length ? " " + status.errors.join(" ") : ""}`,
        );
        transition(() => router.refresh());
        if (!status.pending) break;
        const delay = Math.max(0, (status.nextAttemptAt ?? Date.now()) - Date.now());
        if (delay) {
          setMessage(
            `Queued for retry at ${new Date(Date.now() + delay).toLocaleTimeString()}. ${status.errors.join(" ")}`,
          );
          await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 120000)));
        }
      }
    } catch {
      setMessage(
        "Processing was interrupted. Saved results remain available. Use Resume sync, or the independent worker will continue this request. Reconnect Google if connection access expired.",
      );
      transition(() => router.refresh());
    } finally {
      executing.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        transition(async () => {
          await submit();
        });
      }}
      className="form-grid"
    >
      <p>
        Sync mapped location for{" "}
        <strong>
          {start} – {end}
        </strong>
        , comparison {previousStart} – {previousEnd}, and available reviews. Google requests use
        full reporting months. Manual requests share a 60-second cooldown.
      </p>
      <div className="form-footer">
        <button type="submit" className="button" disabled={busy}>
          {busy ? "Syncing…" : pending ? "Resume sync" : "Sync now"}
        </button>
      </div>
      {message ? (
        <p role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      <p className="muted">
        Keep this page open to finish the requested sync. If interrupted, resume here; the
        independent worker can also recover pending pages. No daily Google collection is scheduled.
      </p>
    </form>
  );
}
