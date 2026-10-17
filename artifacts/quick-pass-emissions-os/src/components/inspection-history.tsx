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
      "Sign in again, reopen this saved import, and click Start / Resume. Its checkpoint is retained.",
    );
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(body.error || "Sign in again and resume this import.");
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
  const [page, setPage] = useState(1),
    [windowId, setWindowId] = useState(initial.windows[0]?.id || "");
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
              setMessage("Upload a source file for the pending windows, then Resume.");
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
        setWindowId(result.data.windows[0]?.id || "");
      }
      if (!result.data.windows.some((w) => w.id === windowId))
        setWindowId(result.data.windows[0]?.id || "");
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
  const selectedWindow = data.windows.find((w) => w.id === windowId);
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
      <section className="card card-body">
        <h2>Create historical import</h2>
        <p className="muted">
          Choose up to two years. Monthly windows and checkpoints are stored in PostgreSQL. No
          scheduling subscription or unattended worker is used.
        </p>
        {!data.stations.length && (
          <p className="notice warning">
            Configure GA_STATION_ID or register an Analytics station before importing.
          </p>
        )}
        <form
          className="history-form"
          aria-label="Create historical import"
          onSubmit={async (e) => {
            e.preventDefault();
            setActive(false);
            const f = new FormData(e.currentTarget);
            await act("CREATE", {
              input: {
                start: f.get("start"),
                end: f.get("end"),
                stations: f.getAll("stations"),
                mode: f.get("mode"),
                source: f.get("source"),
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
              min={earliest}
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
              min={earliest}
              max={today}
              defaultValue={today}
              required
            />
          </label>
          <label>
            Source method
            <select name="mode" defaultValue="FILE">
              <option value="FILE">Upload CSV / original Excel export</option>
              <option value="PORTAL" disabled={!data.portalReady}>
                Existing portal bulk export
              </option>
            </select>
          </label>
          <label>
            Source system
            <input name="source" defaultValue="GA_DASHBOARD" pattern="[A-Z0-9_-]{1,60}" required />
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
                  defaultChecked={i === 0}
                />
                {s.name}
                {!s.portal && " · file imports only"}
              </label>
            ))}
          </fieldset>
          <label className="history-check">
            <input type="checkbox" name="timezoneConfirmed" required />I confirm source-local dates
            refer to America/New_York. Explicit timestamp offsets are converted to Eastern dates.
          </label>
          <button
            className="button button-primary"
            disabled={busy || active || !data.stations.length}
          >
            Create import
          </button>
        </form>
        {!data.portalReady && (
          <p className="muted">
            For portal collection, configure the existing GA_STATION_ID, GA_DASHBOARD_USERNAME and
            GA_DASHBOARD_PASSWORD on the server. No supported two-year API or provider retention
            guarantee is assumed; unavailable months need an authorized export.
          </p>
        )}
      </section>
      <section className="card card-body">
        <div className="history-heading">
          <h2>Saved imports</h2>
          <button
            className="button button-outline"
            disabled={busy}
            onClick={() => void act("LIST")}
          >
            Refresh status
          </button>
        </div>
        <label>
          Import
          <select
            value={jobId || ""}
            onChange={(e) => {
              setActive(false);
              void act("LIST", { jobId: e.target.value });
            }}
          >
            <option value="" disabled>
              Select an import
            </option>
            {data.selected && !data.jobs.some((j) => j.id === data.selected!.id) && (
              <option value={data.selected.id}>
                {data.selected.startDate} – {data.selected.endDate} · Selected saved import
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
            Previous imports
          </button>
          <span>
            Saved imports page {data.jobPage} of {data.jobPages} · 15 per page
          </span>
          <button
            type="button"
            className="button button-outline button-sm"
            disabled={busy || active || data.jobPage >= data.jobPages}
            onClick={() => void act("LIST", { jobId: undefined, jobPage: data.jobPage + 1 })}
          >
            Next imports
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
                disabled={busy || active}
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
              Fetched {totals.fetched} · Imported {totals.imported} · Duplicates {totals.duplicates}{" "}
              · Rejected {totals.rejected} · Unresolved {totals.unresolved}. Importing does not
              confirm paid status or post payroll, certificates, revenue, or notifications.
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
                        {w.error}
                      </td>
                      <td>
                        {w.imported} imported
                        <br />
                        {w.duplicates} duplicates
                        <br />
                        {w.rejected} rejected · {w.unresolved} unresolved
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
                        <button
                          className="button button-outline button-sm"
                          disabled={busy || active || !["PARTIAL", "FAILED"].includes(w.status)}
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
                        {w.rejected + w.unresolved > 0 && (
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
      {data.selected && (
        <section className="card card-body">
          <h2>Upload a monthly source</h2>
          <p className="muted">
            CSV or the provider’s original HTML-based .xls export, maximum 2 MB / 10,000 rows. For
            binary .xlsx, save the sheet as UTF-8 CSV first. Original columns are retained
            encrypted; the current upload is explicitly scoped to the selected station and dates.
          </p>
          <form
            className="history-form"
            aria-label="Upload monthly source"
            onSubmit={async (e) => {
              e.preventDefault();
              setActive(false);
              const f = new FormData(e.currentTarget),
                file = f.get("file");
              if (!(file instanceof File) || file.size > 2_000_000) {
                setMessage("Select a source export of at most 2 MB.");
                return;
              }
              await act("UPLOAD", {
                input: {
                  windowId,
                  body: await file.text(),
                  format: file.name.toLowerCase().endsWith(".xls") ? "XLS" : "CSV",
                  reference: f.get("reference"),
                  total: f.get("total") === "" ? null : Number(f.get("total")),
                  replace: f.get("replace") === "on",
                },
              });
            }}
          >
            <label>
              Station and window
              <select value={windowId} onChange={(e) => setWindowId(e.target.value)} required>
                {data.windows.map((w) => (
                  <option value={w.id} key={w.id}>
                    {stationName(w.stationHash)} · {w.startDate} – {w.endDate}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Export file
              <input
                type="file"
                name="file"
                accept=".csv,.xls,text/csv,application/vnd.ms-excel"
                required
              />
            </label>
            <label>
              Source total (optional; blank means unverified)
              <input type="number" name="total" min={0} max={10000} />
            </label>
            <label>
              Source / total evidence reference
              <input
                name="reference"
                required
                maxLength={500}
                placeholder="Report name, export date, and where its total was checked"
              />
            </label>
            <label className="history-check">
              <input type="checkbox" name="replace" />
              Replace this window’s source while retaining previous decisions
            </label>
            <button className="button button-primary" disabled={busy || active || !selectedWindow}>
              Save source &amp; checkpoint
            </button>
          </form>
          <details>
            <summary>CSV columns and status values</summary>
            <p>
              Test Date is required. Supported fields: Inspection ID, Station ID, VIN, License
              Plate, Plate State, Test Date, Issued By, Cert Number, Result, Payment Status, Retest
              Status, Status. Extra columns are preserved. Dates may be ISO dates, ISO timestamps,
              or the original MM/DD/YYYY hh:mm AM/PM format.
            </p>
            <p>
              Payment Status: PAID, UNPAID, REFUNDED, UNKNOWN. Retest Status: INITIAL, PAID_RETEST,
              FREE_RETEST, UNKNOWN. Status: COMPLETED, VOIDED, CANCELLED, INCOMPLETE, UNKNOWN. Blank
              payment/retest stays UNKNOWN. A Pass or Fail result alone never establishes payment.
              Without an inspection ID, precise time and valid identifying evidence are required;
              indistinguishable rows go to review.
            </p>
          </details>
        </section>
      )}
    </div>
  );
}
