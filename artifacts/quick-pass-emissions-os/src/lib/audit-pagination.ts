export const AUDIT_PAGE_SIZE = 15;

export function getAuditPagination(
  recordCount: number,
  requestedPage?: string | string[],
): {
  page: number;
  pageCount: number;
  skip: number;
  take: number;
  rangeStart: number;
  rangeEnd: number;
} {
  const safeRecordCount =
    Number.isSafeInteger(recordCount) && recordCount > 0 ? recordCount : 0;
  const pageCount = Math.max(1, Math.ceil(safeRecordCount / AUDIT_PAGE_SIZE));
  const rawPage = Array.isArray(requestedPage) ? requestedPage[0] : requestedPage;
  const parsedPage = rawPage === undefined ? 1 : Number(rawPage);
  const requested = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const page = Math.min(requested, pageCount);
  const skip = (page - 1) * AUDIT_PAGE_SIZE;

  return {
    page,
    pageCount,
    skip,
    take: AUDIT_PAGE_SIZE,
    rangeStart: safeRecordCount === 0 ? 0 : skip + 1,
    rangeEnd: Math.min(skip + AUDIT_PAGE_SIZE, safeRecordCount),
  };
}
