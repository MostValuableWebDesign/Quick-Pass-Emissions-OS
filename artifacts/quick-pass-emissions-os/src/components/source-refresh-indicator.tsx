import { sourceRefreshLabel, type SourceRefreshStatus } from "@/lib/source-refresh";

export function SourceRefreshIndicator({
  status,
  source,
  label,
}: {
  status: SourceRefreshStatus;
  source: string;
  label?: string;
}) {
  return (
    <p
      className="source-refresh-indicator"
      data-source-status={status}
      role="status"
      aria-live="polite"
    >
      {label && (
        <>
          <strong>{label}:</strong>{" "}
        </>
      )}
      {sourceRefreshLabel(status, source)}
    </p>
  );
}
