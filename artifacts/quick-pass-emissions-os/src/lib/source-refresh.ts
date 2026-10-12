export type SourceRefreshStatus =
  "checking" | "cached" | "source" | "partial" | "failed" | "blocked";

export function sourceRefreshLabel(status: SourceRefreshStatus, source: string) {
  switch (status) {
    case "checking":
      return `Checking ${source}; cached values remain visible.`;
    case "cached":
      return "Showing cached data; no source pull was needed.";
    case "source":
      return `Updated from ${source}.`;
    case "partial":
      return `Partial update from ${source}; remaining values are cached.`;
    case "failed":
      return `Source pull failed; showing cached data.`;
    case "blocked":
      return `Source check deferred; showing cached data.`;
  }
}
