import type { dashboardSnapshot } from "../dashboard/service";
export type DailySnapshot = Awaited<ReturnType<typeof dashboardSnapshot>>;
const usd = (n: number | null) =>
  n === null
    ? "Unavailable — incomplete inputs"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
export const escapeEmail = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export function renderOwnerEmail(snapshot: DailySnapshot, generatedAt: Date, reportUrl?: string) {
  const s = snapshot;
  const subject = `Quick Pass Emissions — Daily owner summary · ${s.today}`;
  const sections: { title: string; lines: string[] }[] = [
    {
      title: "Business snapshot",
      lines: [
        ...(s.demo ? ["DEMO DATA PRESENT — do not treat sample records as business facts."] : []),
        `Tests performed: ${s.tests.performed ?? "Unavailable — no imported station coverage"}`,
        `Commission-eligible tests: ${s.tests.performed === null ? "Unavailable" : s.tests.eligible}; awaiting review: ${s.tests.performed === null ? "Unavailable" : s.tests.awaitingReview}`,
        `Approved employee test counts: ${s.tests.approvedEmployeeCounts} (separate approved source)`,
        `Dealer invoices billed: ${usd(s.revenue.billed)}`,
        `Dealer and rental receipts recorded: ${usd(s.revenue.received)} (not all business receipts)`,
        `Retail revenue estimate: ${usd(s.revenue.retailEstimate)}; unpriced retail tests: ${s.tests.performed === null ? "Unavailable" : s.revenue.unpricedRetail}`,
        `Other revenue estimates: ${usd(s.revenue.otherEstimates)}`,
        `Verified manual revenue: ${usd(s.revenue.verifiedManual)}; unverified manual revenue: ${usd(s.revenue.unverifiedManual)}`,
      ],
    },
    {
      title: "Employee gross pay so far",
      lines: [
        `Base pay: ${usd(s.pay.baseCents)}; commissions: ${usd(s.pay.commissionCents)}`,
        `Gross pay: ${usd(s.pay.grossCents)}`,
        `Known base pay: ${usd(s.pay.knownBaseCents)}; known commissions: ${usd(s.pay.knownCommissionCents)} (partial when inputs are missing)`,
        ...s.pay.missing.slice(0, 15).map((p) => `${p.name}: missing ${p.missing.join(", ")}`),
        ...(s.pay.missing.length > 15
          ? [`${s.pay.missing.length - 15} additional employees need payroll review.`]
          : []),
        ...(s.pay.employees === 0 ? ["No employee payroll records available."] : []),
      ],
    },
    {
      title: "Needs attention — unresolved at generation",
      lines: [
        ...s.attention
          .slice(0, 15)
          .map((a) => `${a.severity.toUpperCase()}: ${a.title} — ${a.detail}`),
        ...(s.attention.length === 0 ? ["No configured attention items found."] : []),
        ...(s.attention.length > 15
          ? [`${s.attention.length - 15} additional items in the app.`]
          : []),
        ...(s.unknownInventory
          ? [`${s.unknownInventory} inventory balances or reorder settings are unavailable.`]
          : []),
      ],
    },
  ];
  const captured = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(generatedAt);
  const note = `Report snapshot captured ${captured} Eastern. Later entries are not included. Missing inputs stay unavailable. Estimates, billing and receipts are separate measures; do not add them together. This is not profit or frozen accounting books.`;
  const text = [
    subject,
    note,
    ...sections.flatMap((s) => ["", s.title, ...s.lines]),
    ...(reportUrl ? ["", `Open saved report: ${reportUrl}`] : []),
  ].join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeEmail(subject)}</title></head><body style="margin:0;background:#f5f7f5;color:#18241c;font-family:Arial,sans-serif"><main style="max-width:640px;margin:24px auto;padding:28px;background:#ffffff;border-top:5px solid #218845"><p style="color:#218845;font-weight:bold">QUICK PASS EMISSIONS</p><h1 style="font-size:25px">Daily owner summary · ${escapeEmail(s.today)}</h1><p style="color:#526257;font-size:13px">${escapeEmail(note)}</p>${sections.map((s) => `<h2 style="font-size:19px;margin-top:28px">${escapeEmail(s.title)}</h2><ul>${s.lines.map((line) => `<li style="margin:10px 0;line-height:1.5">${escapeEmail(line)}</li>`).join("")}</ul>`).join("")}${reportUrl ? `<p><a style="color:#218845" href="${escapeEmail(reportUrl)}">Open saved report in Quick Pass</a></p>` : ""}</main></body></html>`;
  return { subject, text, html };
}
