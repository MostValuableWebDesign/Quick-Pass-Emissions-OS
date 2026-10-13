import Link from "next/link";
export function PayrollPagination({
  label,
  paging,
  href,
  showSummary = true,
}: {
  label: string;
  paging: { total: number; page: number; totalPages: number };
  href: (page: number) => string;
  showSummary?: boolean;
}) {
  return (
    <nav aria-label={`${label} pages`} className="card-body">
      {showSummary && (
        <span>
          {paging.total} {label.toLowerCase()} · Page {paging.page} of {paging.totalPages} · 15 per
          page
        </span>
      )}{" "}
      {paging.page > 1 && <Link href={href(paging.page - 1)}>Previous {label.toLowerCase()}</Link>}{" "}
      {paging.page < paging.totalPages && (
        <Link href={href(paging.page + 1)}>Next {label.toLowerCase()}</Link>
      )}
    </nav>
  );
}
