"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { HistoryView } from "@/modules/station/history/service";
type Reply = { data: HistoryView; batch?: { state: string; nextAt?: string } };
async function request(
  command: string,
  payload: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<Reply> {
  const res = await fetch("/api/inspection-history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, ...payload }),
    signal,
  });
  if (res.redirected || !res.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      "Sign in again, reopen this saved retrieval, and click Start / Resume. Its checkpoint is retained.",
    );
  const body = await res.json();
  if (!res.ok || body.error)
    throw new Error(body.error || "Sign in again and resume this retrieval.");
  return body;
}
export function InspectionHistory({
  initial,
  today,
  earliest,
}: {
  initial: HistoryView;
  today: string;
  earliest: string;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial),
    [active, setActive] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const jobId = data.selected?.id;
  useEffect(() => {
    if (!active || !jobId) return;
    let alive = true;
    const controller = new AbortController();
    void (async () => {
      try {
        while (alive) {
          const result = await request("NEXT", { jobId }, controller.signal);
          if (!alive) break;
          setData(result.data);
          if (["STOPPED", "UPLOAD_REQUIRED"].includes(result.batch?.state || "")) {
            setActive(false);
            router.refresh();
            if (result.batch?.state === "UPLOAD_REQUIRED")
              setMessage(
                "This retained legacy import cannot retrieve VIRs. Create a portal retrieval above; saved legacy data remains intact.",
              );
            break;
          }
          const wait = result.batch?.nextAt
            ? Math.max(500, Date.parse(result.batch.nextAt) - Date.now())
            : 100;
          // This schedules only the next foreground request. The authoritative retry time is in PostgreSQL.
          await new Promise<void>((resolve) => {
            timer.current = setTimeout(resolve, wait);
          });
        }
      } catch (error) {
        if (alive) {
          setActive(false);
          setMessage(
            error instanceof Error
              ? error.message
              : "Connection interrupted. Resume from the saved checkpoint.",
          );
        }
      }
    })();
    return () => {
      alive = false;
      controller.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active, jobId, router]);
  async function act(command: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage("");
    try {
      const result = await request(command, {
        jobId,
        jobPage: command === "CREATE" ? 1 : data.jobPage,
        ...payload,
      });
      setData(result.data);
      if (command === "CREATE" || command === "LIST") {
        setPage(1);
      }
      if ((command === "CREATE" || command === "LIST") && result.data.selected) {
        const url = new URL(window.location.href);
        url.searchParams.set("job", result.data.selected.id);
        window.history.replaceState(null, "", url);
      }
      if (command === "START") setActive(true);
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Request failed. Saved progress remains.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const stationName = (hash: string) =>
    data.stations.find((s) => s.stationHash === hash)?.name || "Registered station";
  const totals = data.windows.reduce(
    (sum, w) => ({
      fetched: sum.fetched + w.fetched,
      imported: sum.imported + w.imported,
      duplicates: sum.duplicates + w.duplicates,
      rejected: sum.rejected + w.rejected,
      unresolved: sum.unresolved + w.unresolved,
    }),
    { fetched: 0, imported: 0, duplicates: 0, rejected: 0, unresolved: 0 },
  );
  return (
    <div className="history-workspace">
      {message && (
        <p className="notice warning" role="alert">
          {message}
        </p>
      )}
      <section className="card card-body" id="retrieve-virs">
        <h2>Retrieve historical VIRs</h2>
        <p className="muted">
          Retrieve the previous 24 months by default. Structured VIR report fields are read
          directly; no OCR engine is installed. Monthly windows, original reports and checkpoints
          are stored encrypted in PostgreSQL. Keep this screen open to process bounded batches.
        </p>
        {!data.stations.length && (
          <p className="notice warning">
            Configure GA_STATION_ID or register an Analytics station before retrieving VIRs.
          </p>
        )}
        <form
          className="history-form"
          aria-label="Retrieve historical VIRs"
          onSubmit={async (e) => {
            e.preventDefault();
            setActive(false);
            const f = new FormData(e.currentTarget);
            await act("CREATE", {
              input: {
                start: f.get("start"),
                end: f.get("end"),
                stations: f.getAll("stations"),
                mode: "PORTAL",
                source: "GA_DASHBOARD",
                recordLimit: f.get("recordLimit"),
                timezoneConfirmed: f.get("timezoneConfirmed") === "on",
              },
            });
          }}
        >
          <label>
            From
            <input
              type="date"
              name="start"
              min="2000-01-01"
              max={today}
              defaultValue={earliest}
              required
            />
          </label>
          <label>
            Through
            <input
              type="date"
              name="end"
              min="2000-01-01"
              max={today}
              defaultValue={today}
              required
            />
          </label>
          <label>
            Records per batch
            <input
              type="number"
              name="recordLimit"
              min={25}
              max={200}
              defaultValue={100}
              required
            />
          </label>
          <fieldset>
            <legend>Authorized stations</legend>
            {data.stations.map((s, i) => (
              <label key={s.stationHash} className="history-check">
                <input
                  type="checkbox"
                  name="stations"
                  value={s.stationHash}
                  defaultChecked={i === 0 && s.portal}
                  disabled={!s.portal}
                />
                {s.name}
                {!s.portal && " · portal access unavailable"}
              </label>
            ))}
          </fieldset>
          <label className="history-check">
            <input type="checkbox" name="timezoneConfirmed" required />I confirm source-local dates
            refer to America/New_York. Explicit timestamp offsets are converted to Eastern dates.
          </label>
          <button className="button button-primary" disabled={busy || active || !data.portalReady}>
            Save retrieval job
          </button>
        </form>
        {!data.portalReady && (
          <p className="muted">
            For portal collection, configure the existing GA_STATION_ID, GA_DASHBOARD_USERNAME and
            GA_DASHBOARD_PASSWORD on the server. No supported two-year API or provider retention
            guarantee is assumed; unavailable months stay unverified until the portal can supply
            them.
          </p>
        )}
      </section>
      <section className="card card-body">
        <div className="history-heading">
          <h2>Saved retrieval jobs</h2>
          <button
            className="button button-outline"
            disabled={busy}
            onClick={() => void act("LIST")}
          >
            Refresh status
          </button>
        </div>
        <label>
          Retrieval job
          <select
            value={jobId || ""}
            onChange={(e) => {
              setActive(false);
              void act("LIST", { jobId: e.target.value });
            }}
          >
            <option value="" disabled>
              Select a saved job
            </option>
            {data.selected && !data.jobs.some((j) => j.id === data.selected!.id) && (
              <option value={data.selected.id}>
                {data.selected.startDate} – {data.selected.endDate} · Selected saved job
              </option>
            )}
            {data.jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.startDate} – {j.endDate} · {j.mode} · {j.status}
              </option>
            ))}
          </select>
        </label>
        <div className="history-actions">
          <button
            type="button"
            className="button button-outline button-sm"
            disabled={busy || active || data.jobPage <= 1}
            onClick={() => void act("LIST", { jobId: undefined, jobPage: data.jobPage - 1 })}
          >
            Previous jobs
          </button>
          <span>
            Saved retrieval jobs page {data.jobPage} of {data.jobPages} · 15 per page
          </span>
          <button
            type="button"
            className="button button-outline button-sm"
            disabled={busy || active || data.jobPage >= data.jobPages}
            onClick={() => void act("LIST", { jobId: undefined, jobPage: data.jobPage + 1 })}
          >
            Next jobs
          </button>
        </div>
        {data.selected && (
          <>
            <p>
              <strong>
                {active
                  ? "Processing while this screen is open"
                  : "Not processing in this browser · Start / Resume to continue"}
              </strong>
              . Stored job state:{" "}
              {data.selected.status === "RUNNING" && !active
                ? "Ready to resume"
                : data.selected.status}
              . Current requests may finish their bounded batch after closing or pausing.
            </p>
            <div className="history-actions">
              <button
                className="button button-primary"
                disabled={busy || active || data.selected.mode === "FILE"}
                onClick={() => void act("START")}
              >
                Start / Resume
              </button>
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() => {
                  setActive(false);
                  void act("PAUSE");
                }}
              >
                Pause
              </button>
              <button
                type="button"
                className="button button-outline"
                onClick={() => router.refresh()}
              >
                Refresh returning-vehicle report
              </button>
            </div>
            <p className="muted">
              Retrieved {totals.fetched} · Parsed {totals.imported + totals.duplicates} · Duplicates{" "}
              {totals.duplicates} · Rejected {totals.rejected} · Unresolved {totals.unresolved}.
              Retrieval does not confirm paid status or post payroll, certificates, revenue, or
              notifications.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Station / window</th>
                    <th>Status / reconciliation</th>
                    <th>Counts</th>
                    <th>Checkpoint / next attempt</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {data.windows.slice((page - 1) * 15, page * 15).map((w) => (
                    <tr key={w.id}>
                      <td>
                        {stationName(w.stationHash)}
                        <br />
                        {w.startDate} – {w.endDate}
                        <br />
                        Source attempt {w.revision}
                      </td>
                      <td>
                        {w.status === "RUNNING" && w.leaseExpired
                          ? "Interrupted · ready to resume"
                          : w.status}
                        <br />
                        {w.sourceTotal === null
                          ? "Completeness unverified · no source total"
                          : `${w.fetched}/${w.sourceTotal} source rows · ${w.totalBasis.replaceAll("_", " ").toLowerCase()}`}
                        <br />
                        {w.retrievalComplete
                          ? "All-page retrieval reconciled"
                          : "Retrieval unverified"}
                        <br />
                        {w.stagedAt
                          ? `${w.cursor}/${w.fetched} extraction decisions saved`
                          : "Not yet extracted"}
                        <br />
                        {w.retrievedAt &&
                          `Fetched ${new Date(w.retrievedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} Eastern`}
                        <br />
                        {w.error}
                      </td>
                      <td>
                        {w.imported + w.duplicates} parsed
                        <br />
                        {w.duplicates} duplicates
                        <br />
                        {w.rejected} failed · {w.unresolved + w.identityReview} needing review
                      </td>
                      <td>
                        Row {w.cursor}
                        <br />
                        {w.checkpointAt
                          ? new Date(w.checkpointAt).toLocaleString("en-US", {
                              timeZone: "America/New_York",
                            })
                          : "No checkpoint"}
                        <br />
                        {w.nextAttemptAt &&
                          `Retry ${new Date(w.nextAttemptAt).toLocaleString("en-US", { timeZone: "America/New_York" })} Eastern`}
                      </td>
                      <td>
                        {w.reportDigest && (
                          <p>
                            <a
                              href={`/api/inspection-history/source?jobId=${jobId}&windowId=${w.id}`}
                            >
                              Original VIR source
                            </a>
                          </p>
                        )}
                        <button
                          className="button button-outline button-sm"
                          disabled={
                            busy ||
                            active ||
                            !["PARTIAL", "FAILED", "UNAVAILABLE"].includes(w.status)
                          }
                          onClick={() => void act("RETRY", { windowId: w.id })}
                        >
                          Retry window
                        </button>
                        <button
                          type="button"
                          className="button button-outline button-sm"
                          disabled={
                            busy || active || w.startDate === w.endDate || w.status === "COMPLETED"
                          }
                          onClick={() => {
                            setActive(false);
                            void act("SPLIT", { windowId: w.id });
                          }}
                        >
                          Split window
                        </button>
                        {w.rejected + w.unresolved + w.identityReview > 0 && (
                          <a
                            href={`/api/inspection-history/errors?jobId=${jobId}&windowId=${w.id}`}
                          >
                            Download row errors
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="history-actions">
              <button
                className="button button-outline button-sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} of {Math.max(1, Math.ceil(data.windows.length / 15))} · 15 windows per
                page
              </span>
              <button
                className="button button-outline button-sm"
                disabled={page * 15 >= data.windows.length}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
