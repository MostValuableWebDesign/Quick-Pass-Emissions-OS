"use client";
import { useActionState } from "react";
import { reviewBusinessImport, applyBusinessImport } from "@/app/business-import-actions";
import { Button } from "./ui/button";
export function BusinessImportPanel() {
  const [review, reviewAction, reviewing] = useActionState(reviewBusinessImport, {});
  const [result, applyAction, applying] = useActionState(applyBusinessImport, {});
  return (
    <div className="stack">
      <form action={reviewAction} className="card card-body stack">
        <h2>Dry run</h2>
        <label htmlFor="private-import-manifest">
          Reviewed structured manifest · private business information
        </label>
        <textarea
          id="private-import-manifest"
          name="manifest"
          required
          rows={8}
          maxLength={150000}
        />
        <Button disabled={reviewing}>{reviewing ? "Comparing…" : "Preview without writing"}</Button>
        {review.message && <p role="status">{review.message}</p>}
      </form>
      {review.preview && (
        <section className="card card-body stack">
          <h2>Proposed field-level changes</h2>
          <p>
            {Object.entries(review.preview.counts)
              .map(([key, value]) => `${value} ${key}`)
              .join(" · ")}
          </p>
          {review.preview.items.map((item) => (
            <details key={item.key}>
              <summary>
                {item.key} · {item.outcome.toLowerCase()}
              </summary>
              <p>
                Source section: {item.section} · Match: {item.match ?? "No existing record"}
              </p>
              <p>{item.message}</p>
              <p>Required / unconfigured: {item.missing.join("; ")}</p>
              <pre className="audit-details">
                {JSON.stringify(
                  { saved: item.before, proposed: item.proposed, changes: item.changes },
                  null,
                  2,
                )}
              </pre>
            </details>
          ))}
          <form action={applyAction} className="stack">
            <input type="hidden" name="token" value={review.token} />
            <label>
              <input type="checkbox" name="confirm" value="yes" required /> I reviewed these exact
              changes. Apply supported references only after a verified backup.
            </label>
            <Button disabled={applying}>
              {applying ? "Backing up and applying…" : "Back up and apply reviewed changes"}
            </Button>
          </form>
        </section>
      )}
      {result.message && (
        <p className={result.ok ? "notice" : "error-text"} role="status">
          {result.message}
        </p>
      )}
    </div>
  );
}
